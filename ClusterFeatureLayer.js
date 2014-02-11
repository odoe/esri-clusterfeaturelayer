define([
  'dojo/_base/declare',
  'dojo/_base/array',
  'dojo/_base/lang',
  'dojo/_base/Color',
  'dojo/_base/connect',
  'dojo/on',

  'esri/SpatialReference',
  'esri/geometry/Point',
  'esri/graphic',
  'esri/symbols/SimpleMarkerSymbol',
  'esri/symbols/SimpleLineSymbol',
  'esri/symbols/TextSymbol',
  'esri/symbols/Font',

  'esri/dijit/PopupTemplate',
  'esri/layers/GraphicsLayer',
  'esri/tasks/query',
  'esri/tasks/QueryTask'

], function (
  declare, arrayUtils, lang, Color, connect, on,
  SpatialReference, Point, Graphic, SimpleMarkerSymbol, SimpleLineSymbol, TextSymbol, Font,
  PopupTemplate, GraphicsLayer, Query, QueryTask
) {
  return declare([GraphicsLayer], {
    constructor: function(options) {
      // options:
      //   url:  string
      //    URL string. Required. Will generate clusters based on Features returned from map service. Must be esriGeometryPoint type.
      //   outFields:  Array?
      //    Optional. Defines what fields are returned with Features.
      //   distance:  Number?
      //     Optional. The max number of pixels between points to group points in the same cluster. Default value is 50.
      //   labelColor:  String?
      //     Optional. Hex string or array of rgba values used as the color for cluster labels. Default value is #fff (white).
      //   labelOffset:  String?
      //     Optional. Number of pixels to shift a cluster label vertically. Defaults to -5 to align labels with circle symbols. Does not work in IE.
      //   resolution:  Number
      //     Required. Width of a pixel in map coordinates. Example of how to calculate: 
      //     map.extent.getWidth() / map.width
      //   showSingles:  Boolean?
      //     Optional. Whether or graphics should be displayed when a cluster graphic is clicked. Default is true.
      //   zoomOnClick:  Boolean?
      //     Optional. Will zoom the map when a cluster graphic is clicked. Default is true.
      //   singleSymbol:  MarkerSymbol?
      //     Marker Symbol (picture or simple). Optional. Symbol to use for graphics that represent single points. Default is a small gray SimpleMarkerSymbol.
      //   singleTemplate:  PopupTemplate?
      //     PopupTemplate</a>. Optional. Popup template used to format attributes for graphics that represent single points. Default shows all attributes as 'attribute = value' (not recommended).
      //   maxSingles:  Number?
      //     Optional. Threshold for whether or not to show graphics for points in a cluster. Default is 1000.
      //   webmap:  Boolean?
      //     Optional. Whether or not the map is from an ArcGIS.com webmap. Default is false.
      //   font:  Boolean?
      //     Optional. Font to use for TextSymbol. Default is 10pt, Arial.
      //   spatialReference:  SpatialReference?
      //     Optional. Spatial reference for all graphics in the layer. This has to match the spatial reference of the map. Default is 102100. Omit this if the map uses basemaps in web mercator.
      this._clusterTolerance = options.distance || 50;
      this._clusterData = [];
      this._clusters = [];
      this._clusterLabelColor = options.labelColor || '#000';
      // labelOffset can be zero so handle it differently
      this._clusterLabelOffset = (options.hasOwnProperty('labelOffset')) ? options.labelOffset : -5;
      // graphics that represent a single point
      this._singles = []; // populated when a graphic is clicked
      this._showSingles = options.hasOwnProperty('showSingles') ? options.showSingles : true;
      this._zoomOnClick = options.hasOwnProperty('zoomOnClick') ? options.zoomOnClick : true;
      // symbol for single graphics
      var sms = SimpleMarkerSymbol;
      this._singleSym = options.singleSymbol || new sms('circle', 6, null, new Color('#888'));
      this._singleTemplate = options.singleTemplate || new PopupTemplate({ 'title': '', 'description': '{*}' });
      this._maxSingles = options.maxSingles || 1000;

      this._webmap = options.hasOwnProperty('webmap') ? options.webmap : false;

      this._font =options.font || new Font('10pt').setFamily('Arial');

      this._sr = options.spatialReference || new SpatialReference({ 'wkid': 102100 });

      this._zoomEnd = null;

      this.url = options.url || null;
      this._outFields = options.outFields || ['*'];
      this.queryTask = new QueryTask(this.url);

      if (!this.url) {
        throw new Error('url is a required parameter');
      }
    },

    // override esri/layers/GraphicsLayer methods 
    _setMap: function(map, surface) {
      // connect to onZoomEnd so data is re-clustered when zoom level changes
      this._zoomEnd = connect.connect(map, 'onZoomEnd', this, function() {
        // update resolution
        this._clusterResolution = this._map.extent.getWidth() / this._map.width;
        this._getObjectIds();
      });

      this._extentChange = on(map, 'extent-change', lang.hitch(this, function() {
        this._clusterResolution = this._map.extent.getWidth() / this._map.width;
        this._getObjectIds();
      }));

      var layerAdded = on(map, 'layer-add', lang.hitch(this, function(e) {
        if (e.layer === this) {
          layerAdded.remove();
          // calculate and set the initial resolution
          this._clusterResolution = map.extent.getWidth() / map.width; // probably a bad default...
          this._getObjectIds(map.extent);
        }
      }));

      // GraphicsLayer will add its own listener here
      var div = this.inherited(arguments);
      return div;
    },

    _unsetMap: function() {
      this.inherited(arguments);
      connect.disconnect(this._zoomEnd);
      this._extentChange.remove();
    },

    _getObjectIds: function(extent) {
      if (this.url) {
        var ext = extent || this._map.extent;
        var sr = ext.spatialReference;
        var query = new Query();
        query.geometry = ext;
        this.queryTask.executeForIds(query).then(
          lang.hitch(this, '_onIdsReturned'), this._onError
        );
      }
    },

    _onError: function(err) {
      console.warn('ReturnIds Error', err);
    },

    _onIdsReturned: function(results) {
      if (results) {
        var query = new Query();
        query.outSpatialReference = this._map.spatialReference;
        query.objectIds = results;
        query.returnGeometry = true;
        query.outFields = this._outFields;
        this.queryTask.execute(query).then(
          lang.hitch(this, '_onFeaturesReturned'), this._onError
        );
      }
    },

    _onFeaturesReturned: function(results) {
      if (results.features.length) {
        this._clusterData = results.features;
        this.clear();
        this._clusterGraphics();
      }
    },

    // public ClusterLayer methods
    add: function(p) {
      // Summary:  The argument is a data point to be added to an existing cluster. If the data point falls within an existing cluster, it is added to that cluster and the cluster's label is updated. If the new point does not fall within an existing cluster, a new cluster is created.
      //
      // if passed a graphic, use the GraphicsLayer's add method
      if ( p.declaredClass ) {
        this.inherited(arguments);
        return;
      }

      // add the new data to _clusterData so that it's included in clusters
      // when the map level changes
      this._clusterData.push(p);
      var clustered = false;
      // look for an existing cluster for the new point
      for ( var i = 0; i < this._clusters.length; i++ ) {
        var c = this._clusters[i];
        if ( this._clusterTest(p, c) ) {
          // add the point to an existing cluster
          this._clusterAddPoint(p, c);
          // update the cluster's geometry
          this._updateClusterGeometry(c);
          // update the label
          this._updateLabel(c);
          clustered = true;
          break;
        }
      }

      if ( ! clustered ) {
        this._clusterCreate(p);
        p.attributes.clusterCount = 1;
        this._showCluster(p);
      }
    },

    clear: function() {
      // Summary:  Remove all clusters and data points.
      this.inherited(arguments);
      this._clusters.length = 0;
    },

    clearSingles: function(singles) {
      // Summary:  Remove graphics that represent individual data points.
      var s = singles || this._singles;
      arrayUtils.forEach(s, function(g) {
        this.remove(g);
      }, this);
      this._singles.length = 0;
    },

    onClick: function(e) {
      // zoom in to cluster if possible
      if(
        this._zoomOnClick &&
          e.graphic.attributes.clusterCount > 1 &&
            this._map.getZoom() !== this._map.getMaxZoom()
      ) {
        this._map.centerAndZoom(
          e.graphic.geometry,
          this._map.getZoom() + 1
        );
      } else {
        // remove any previously showing single features
        this.clearSingles(this._singles);

        // find single graphics that make up the cluster that was clicked
        // would be nice to use filter but performance tanks with large arrays in IE
        var singles = [];
        for ( var i = 0, il = this._clusterData.length; i < il; i++) {
          if ( e.graphic.attributes.clusterId == this._clusterData[i].attributes.clusterId ) {
            singles.push(this._clusterData[i]);
          }
        }
        if ( singles.length > this._maxSingles ) {
          alert('Sorry, that cluster contains more than ' + this._maxSingles + ' points. Zoom in for more detail.');
          return;
        } else {
          // stop the click from bubbling to the map
          e.stopPropagation();
          this._map.infoWindow.show(e.graphic.geometry);
          this._addSingles(singles);
        }
      }
    },

    // internal methods 
    _clusterGraphics: function() {
      // first time through, loop through the points
      for ( var j = 0, jl = this._clusterData.length; j < jl; j++ ) {
        // see if the current feature should be added to a cluster
        var point = this._clusterData[j].geometry || this._clusterData[j];
        var feature = this._clusterData[j];
        var clustered = false;
        var numClusters = this._clusters.length;
        for ( var i = 0; i < this._clusters.length; i++ ) {
          var c = this._clusters[i];
          if ( this._clusterTest(point, c) ) {
            this._clusterAddPoint(feature, point, c);
            clustered = true;
            break;
          }
        }

        if ( ! clustered ) {
          this._clusterCreate(feature, point);
        }
      }
      this._showAllClusters();
    },

    _clusterTest: function(p, cluster) {
      var distance = (
        Math.sqrt(
          Math.pow((cluster.x - p.x), 2) + Math.pow((cluster.y - p.y), 2)
      ) / this._clusterResolution
      );
      return (distance <= this._clusterTolerance);
    },

    // points passed to clusterAddPoint should be included 
    // in an existing cluster
    // also give the point an attribute called clusterId 
    // that corresponds to its cluster
    _clusterAddPoint: function(feature, p, cluster) {
      // average in the new point to the cluster geometry
      var count, x, y;
      count = cluster.attributes.clusterCount;
      x = (p.x + (cluster.x * count)) / (count + 1);
      y = (p.y + (cluster.y * count)) / (count + 1);
      cluster.x = x;
      cluster.y = y;

      // build an extent that includes all points in a cluster
      // extents are for debug/testing only...not used by the layer
      if ( p.x < cluster.attributes.extent[0] ) {
        cluster.attributes.extent[0] = p.x;
      } else if ( p.x > cluster.attributes.extent[2] ) {
        cluster.attributes.extent[2] = p.x;
      }
      if ( p.y < cluster.attributes.extent[1] ) {
        cluster.attributes.extent[1] = p.y;
      } else if ( p.y > cluster.attributes.extent[3] ) {
        cluster.attributes.extent[3] = p.y;
      }

      // increment the count
      cluster.attributes.clusterCount++;
      // attributes might not exist
      if ( ! p.hasOwnProperty('attributes') ) {
        p.attributes = {};
      }
      // give the graphic a cluster id
      feature.attributes.clusterId = p.attributes.clusterId = cluster.attributes.clusterId;
    },

    // point passed to clusterCreate isn't within the 
    // clustering distance specified for the layer so
    // create a new cluster for it
    _clusterCreate: function(feature, p) {
      var clusterId = this._clusters.length + 1;
      // console.log('cluster create, id is: ', clusterId);
      // p.attributes might be undefined
      if ( ! p.attributes ) {
        p.attributes = {};
      }
      feature.attributes.clusterId = p.attributes.clusterId = clusterId;
      // create the cluster
      var cluster = { 
        'x': p.x,
        'y': p.y,
        'attributes' : {
          'clusterCount': 1,
          'clusterId': clusterId,
          'extent': [ p.x, p.y, p.x, p.y ]
        }
      };
      this._clusters.push(cluster);
    },

    _showAllClusters: function() {
      for ( var i = 0, il = this._clusters.length; i < il; i++ ) {
        var c = this._clusters[i];
        this._showCluster(c);
      }
    },

    _showCluster: function(c) {
      var point = new Point(c.x, c.y, this._sr);
      var count = c.attributes.clusterCount;

      this.add(
        new Graphic(
          point,
          null,
          c.attributes)
      );
      // code below is used to not label clusters with a single point
      if ( c.attributes.clusterCount < 2 ) {
        return;
      }

      // show number of points in the cluster
      var label = new TextSymbol(c.attributes.clusterCount)
      .setColor(new Color(this._clusterLabelColor))
      .setOffset(0, this._clusterLabelOffset)
      .setFont(this._font);
      this.add(
        new Graphic(
          point,
          label,
          c.attributes
      )
      );
    },

    _addSingles: function(singles) {
      // add single graphics to the map
      arrayUtils.forEach(singles, function(g) {
        g.setSymbol(this.singleSym);
        g.setInfoTemplate(this._singleTemplate);
        this._singles.push(g);
        if ( this._showSingles ) {
          this.add(g);
        }
      }, this);
      this._map.infoWindow.setFeatures(this._singles);
    },

    _updateClusterGeometry: function(c) {
      // find the cluster graphic
      var cg = arrayUtils.filter(this.graphics, function(g) {
        return ! g.symbol &&
          g.attributes.clusterId == c.attributes.clusterId;
      });
      if ( cg.length == 1 ) {
        cg[0].geometry.update(c.x, c.y);
      } else {
        console.log('didn not find exactly one cluster geometry to update: ', cg);
      }
    },

    _updateLabel: function(c) {
      // find the existing label
      var label = arrayUtils.filter(this.graphics, function(g) {
        return g.symbol && 
          g.symbol.declaredClass == 'esri.symbol.TextSymbol' &&
          g.attributes.clusterId == c.attributes.clusterId;
      });
      if ( label.length == 1 ) {
        // console.log('update label...found: ', label);
        this.remove(label[0]);
        var newLabel = new TextSymbol(c.attributes.clusterCount)
        .setColor(new Color(this._clusterLabelColor))
        .setOffset(0, this._clusterLabelOffset)
        .setFont(this._font);
        this.add(
          new Graphic(
            new Point(c.x, c.y, this._sr),
            newLabel,
            c.attributes)
        );
      } else {
        console.log('didn not find exactly one label: ', label);
      }
    },

    // debug only...never called by the layer
    _clusterMeta: function() {
      // print total number of features
      console.log('Total:  ', this._clusterData.length);

      // add up counts and print it
      var count = 0;
      arrayUtils.forEach(this._clusters, function(c) {
        count += c.attributes.clusterCount;
      });
      console.log('In clusters:  ', count);
    }

  });
});

