define([
  'dojo/_base/declare',
  'dojo/_base/array',
  'dojo/_base/lang',
  'dojo/_base/Color',
  'dojo/_base/connect',
  'dojo/on',
  'dojo/promise/all',

  'esri/SpatialReference',
  'esri/geometry/Point',
  'esri/graphic',

  'esri/symbols/SimpleMarkerSymbol',
  'esri/symbols/SimpleLineSymbol',
  'esri/symbols/SimpleFillSymbol',
  'esri/symbols/TextSymbol',
  'esri/symbols/Font',

  'esri/renderers/ClassBreaksRenderer',

  'esri/request',
  'esri/symbols/jsonUtils',
  'esri/renderers/jsonUtils',

  'esri/dijit/PopupTemplate',
  'esri/layers/GraphicsLayer',
  'esri/tasks/query',
  'esri/tasks/QueryTask'

], function (
  declare, arrayUtils, lang, Color, connect, on, all,
  SpatialReference, Point, Graphic,
  SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol, TextSymbol, Font,
  ClassBreaksRenderer,
  esriRequest, symbolJsonUtils, rendererJsonUtil,
  PopupTemplate, GraphicsLayer, Query, QueryTask
) {

  function concat(a1, a2) {
    return a1.concat(a2);
  }

  function merge(arrs) {
    //var start = new Date().valueOf();
    //console.debug('merge start');
    var len = arrs.length, target = [];

    while (len--) {
      var o = arrs[len];
      if (o.constructor === Array) {
        target = concat(target, o);
      } else {
        target.push(o);
      }
    }

    //var end = new Date().valueOf();
    //console.debug('merge end', (end - start)/1000);
    return target;
  }

  function difference(arr1/*new objectIds*/, cacheCount/*objectId cache length*/, hash/*objecid hash*/) {
    //var start = new Date().valueOf();
    //console.debug('difference start');
    var len = arr1.length, diff = [];
    if (!cacheCount) {
      diff = arr1;
      while (len--) {
        var value = arr1[len];
        if (!hash[value]) {
          hash[value] = value;
        }
      }
      //var endEarly = new Date().valueOf();
      //console.debug('difference end', (endEarly - start)/1000);
      return diff;
    }
    while (len--) {
      var val = arr1[len];
      if (!hash[val]) {
        hash[val] = val;
        diff.push(val);
      }
    }
    //var end = new Date().valueOf();
    //console.debug('difference end', (end - start)/1000);
    return diff;
  }

  function toPoints(features) {
    var len = features.length;
    var points = [];
    while (len--) {
      var g = features[len];
      points.push(
        new Graphic(
          g.geometry.getCentroid(),
          g.symbol, g.attributes,
          g.infoTemplate
      ));
    }
    return points;
  }

  return declare([GraphicsLayer], {
    constructor: function(options) {
      // options:
      //   url:  string
      //    URL string. Required. Will generate clusters based on Features returned from map service.
      //   outFields:  Array?
      //    Optional. Defines what fields are returned with Features.
      //   objectIdField:  String?
      //    Optional. Defines the OBJECTID field of service. Default is 'OBJECTID'.
      //   where:  String?
      //    Optional. Where clause for query.
      //   useDefaultSymbol:  Boolean?
      //    Optional. Use the services default symbology for single features.
      //   returnLimit:  Number?
      //    Optional. Return limit of features returned from query. Default is 1000.
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
      //   singleRenderer:  Renderer?
      //     Optional. Can provide a renderer for single features to override the default renderer.
      //   singleTemplate:  PopupTemplate?
      //     PopupTemplate</a>. Optional. Popup template used to format attributes for graphics that represent single points. Default shows all attributes as 'attribute = value' (not recommended).
      //   maxSingles:  Number?
      //     Optional. Threshold for whether or not to show graphics for points in a cluster. Default is 1000.
      //   font:  TextSymbol?
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
      var sls = SimpleLineSymbol;
      this._singleSym = options.singleSymbol;// || new sms('circle', 6, null, new Color('#888'));
      this._singleTemplate = options.singleTemplate || new PopupTemplate({ 'title': '', 'description': '{*}' });
      this._maxSingles = options.maxSingles || 1000;

      this._font = options.font || new Font('10pt').setFamily('Arial');

      this._sr = options.spatialReference || new SpatialReference({ 'wkid': 102100 });

      this._zoomEnd = null;

      this.url = options.url || null;
      this._outFields = options.outFields || ['*'];
      this.queryTask = new QueryTask(this.url);
      this._where = options.where || null;
      this._useDefaultSymbol = options.hasOwnProperty('useDefaultSymbol') ? options.useDefaultSymbol : false;
      this._returnLimit = options.returnLimit || 1000;
      this._singleRenderer = options.singleRenderer;

      this._objectIdField = options.objectIdField || 'OBJECTID';

      if (!this.url) {
        throw new Error('url is a required parameter');
      }
      this._clusterCache = {};
      this._objectIdCache = [];
      this._objectIdHash = {};

      this.detailsLoaded = false;

      this._query = new Query();

      this.MODE_SNAPSHOT = options.hasOwnProperty('MODE_SNAPSHOT') ? options.MODE_SNAPSHOT : true;

      this._getServiceDetails();
    },

    _getServiceDetails: function() {
      esriRequest({
        url: this.url,
        content: {
          f: 'json'
        },
        handleAs: 'json'
      }).then(lang.hitch(this, function(response) {
        this._defaultRenderer = this._singleRenderer ||
          rendererJsonUtil.fromJson(response.drawingInfo.renderer);
        this.native_geometryType = response.geometryType;
        if (response.geometryType === 'esriGeometryPolygon') {
          this._useDefaultSymbol = false;
          console.info('polygon geometry will be converted to points');
        }
        this.emit('details-loaded', response);
      }));
    },

    _getDefaultSymbol: function(g) {
      var rend = this._defaultRenderer;
      if (!this._useDefaultSymbol || !rend) {
        return this._singleSym;
      } else {
        return rend.getSymbol(g);
      }
    },

    _getRenderedSymbol: function(feature) {
      var attr = feature.attributes;
      if (attr.clusterCount === 1) {
        if (!this._useDefaultSymbol) {
          return this._singleSym;
        }
        var rend = this._defaultRenderer;
        if (!rend) { // something went wrong getting default renderer
          return null;
        } else {
          return rend.getSymbol(feature);
        }
      } else {
        return null;
      }
    },

    _reCluster: function() {
      // update resolution
      this._clusterResolution = this._map.extent.getWidth() / this._map.width;
      this._getObjectIds(this._map.extent);
    },

    // override esri/layers/GraphicsLayer methods
    _setMap: function(map, surface) {
      this._query.outSpatialReference = map.spatialReference;
      this._query.returnGeometry = true;
      this._query.outFields = this._outFields;
      // listen to extent-change so data is re-clustered when zoom level changes
      this._extentChange = on(map, 'extent-change', lang.hitch(this, '_reCluster'));

      var layerAdded = on(map, 'layer-add', lang.hitch(this, function(e) {
        if (e.layer === this) {
          layerAdded.remove();
          if (!this.detailsLoaded) {
            on.once(this, 'details-loaded', lang.hitch(this, function() {
              if (!this.renderer) {
                var sls = SimpleLineSymbol;
                var sms = SimpleMarkerSymbol;
                this._singleSym = this._singleSym ||
                  new sms(
                  sms.STYLE_CIRCLE, 14,
                  new sls(
                    sls.STYLE_SOLID,
                    new Color([255,255,0]), 2
                  ),
                  new Color([0,191,255,0.75])
                );
                var renderer = new ClassBreaksRenderer(this._singleSym, 'clusterCount');

                var small = new sms('circle', 20,
                            new sls(sls.STYLE_SOLID, new Color([255,125,0,0.25]), 10),
                            new Color([255,125,0,0.5]));

                var medium = new sms('circle', 30,
                              new sls(sls.STYLE_SOLID, new Color([255,0,250,0.25]), 10),
                              new Color([255,0,250,0.5]));
                var large = new sms('circle', 50,
                            new sls(sls.STYLE_SOLID, new Color([255,0,0,0.25]), 10),
                            new Color([255,0,0,0.5]));

                renderer.addBreak(2, 10, small);
                renderer.addBreak(10, 25, medium);
                renderer.addBreak(25, Infinity, large);
                this.setRenderer(renderer);
              }
              this._reCluster();
            }));
          }
        }
      }));

      // GraphicsLayer will add its own listener here
      var div = this.inherited(arguments);
      return div;
    },

    _unsetMap: function() {
      this.inherited(arguments);
      this._extentChange.remove();
    },

    _onClusterClick: function(e) {
      var attr;
      if (e.graphic) {
       attr = e.graphic.attributes;
      }
      if (attr && attr.clusterCount) {
        var source = arrayUtils.filter(this._clusterData, function(g) {
          return attr.clusterId === g.attributes.clusterId;
        }, this);
        this.emit('cluster-click', source);
      }
    },

    _getObjectIds: function(extent) {
      if (this.url) {
        var ext = extent || this._map.extent;
        this._query.objectIds = null;
        if (this._where) {
          this._query.where = this._where;
        }
        if (!this.MODE_SNAPSHOT) {
          this._query.geometry = ext;
        }
        if(!this._query.geometry && !this._query.where) {
          this._query.where = '1=1';
        }
        this.queryTask.executeForIds(this._query).then(
          lang.hitch(this, '_onIdsReturned'), this._onError
        );
      }
    },

    _onError: function(err) {
      console.warn('ReturnIds Error', err);
    },

    _onIdsReturned: function(results) {
      var uncached = difference(results, this._objectIdCache.length, this._objectIdHash);
      this._objectIdCache = concat(this._objectIdCache, uncached);
      if (uncached && uncached.length) {
        this._query.where = null;
        this._query.geometry = null;
        var queries = [];
        if (uncached.length > this._returnLimit) {
          while(uncached.length) {
            this._query.where = this._objectIdField + ' IN (' + (uncached.splice(0, this._returnLimit - 1)).join(',') + ')';
            queries.push(this.queryTask.execute(this._query));
          }
          all(queries).then(lang.hitch(this, function(res) {
            var features = arrayUtils.map(res, function(r) {
              return r.features;
            });
            this._onFeaturesReturned({
              features: merge(features)
            });
          }));
        } else {
          this._query.where = this._objectIdField + ' IN (' + uncached.join(',') + ')';
          this.queryTask.execute(this._query).then(
            lang.hitch(this, '_onFeaturesReturned'), this._onError
          );
        }
      } else if (this._objectIdCache.length) {
        this._onFeaturesReturned({ // kinda hacky here
          features: []
        });
      } else {
        this.clear();
      }
    },

    _inExtent: function() {
      //var start = new Date().valueOf();
      //console.debug('#inExtent start');
      var ext = this._map.extent;
      var len = this._objectIdCache.length;
      var valid = [];

      while(len--) {
        var oid = this._objectIdCache[len];
        var cached = this._clusterCache[oid];
        if (cached && ext.contains(cached.geometry)) {
          valid.push(cached);
        }
      }
      //var end = new Date().valueOf();
      //console.debug('#inExtent end', (end - start)/1000);
      return valid;
    },

    _onFeaturesReturned: function(results) {
      //var start = new Date().valueOf();
      //console.debug('#_onFeaturesReturned start');
      var inExtent = this._inExtent();
      var features;
      if (this.native_geometryType === 'esriGeometryPolygon') {
        features = toPoints(results.features);
      } else {
        features = results.features;
      }
      var len = features.length;
      this._clusterData.length = 0;
      this.clear();
      if (len) {
        arrayUtils.forEach(features, function(feat) {
          this._clusterCache[feat.attributes[this._objectIdField]] = feat;
        }, this);
      }
      this._clusterData = concat(features, inExtent);
      this._clusterGraphics();
      //var end = new Date().valueOf();
      //console.debug('#_onFeaturesReturned end', (end - start)/1000);
    },

    // public ClusterLayer methods
    updateClusters: function() {
      this.clearCache();
      this._reCluster();
    },
    clearCache: function() {
      // Summary: Clears the cache for clustered items
      arrayUtils.forEach(this._objectIdCache, function(oid) {
        delete this._objectIdCache[oid];
      }, this);
      this._objectIdCache.length = 0;
      this._clusterCache = {};
      this._objectIdHash = {};
    },

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
      this._onClusterClick(e);
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
      this.clear();
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
      //var start = new Date().valueOf();
      //console.debug('#_showAllClusters start');
      var len = this._clusters.length;

      for ( var i = 0, il = this._clusters.length; i < il; i++ ) {
        this._showCluster(this._clusters[i]);
      }
      this.emit('clusters-shown', this._clusters);
      //var end = new Date().valueOf();
      //console.debug('#_showAllClusters end', (end - start)/1000);
    },

    _showCluster: function(c) {
      var point = new Point(c.x, c.y, this._sr);
      var count = c.attributes.clusterCount;

      var g = new Graphic(point, null, c.attributes);
      g.setSymbol(this._getRenderedSymbol(g));
      this.add(g);
      // code below is used to not label clusters with a single point
      if ( c.attributes.clusterCount < 2 ) {
        return;
      }

      // show number of points in the cluster
      var label = new TextSymbol(c.attributes.clusterCount.toString())
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
        g.setSymbol(this._getDefaultSymbol(g));
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
        var newLabel = new TextSymbol(c.attributes.clusterCount.toString())
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

