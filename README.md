# Esri ClusterFeatureLayer

This is a slightly revised version of the Cluster Example provided [here](https://developers.arcgis.com/javascript/jssamples/layers_point_clustering.html).

A couple of things I added:

* Works off a URL instead of a data option, like a [FeatureLayer](https://developers.arcgis.com/javascript/jsapi/featurelayer-amd.html).
* Option to add a [Font](https://developers.arcgis.com/javascript/jsapi/font-amd.html) for the Clusters [TextSymbol](https://developers.arcgis.com/javascript/jsapi/textsymbol-amd.html). Default is `10pt` and `Arial`.
* If a service of geometryType `esriGeometryPolygon` is provided, it will
  convert those geometries to points and cluster them.
* A `zoomOnClick` option that will zoom the map 1 zoom level on the clicked
  cluster graphic.
* Has a `MODE_SNAPSHOT` that will cache all features in the service for
  increased performance. Refresh the layer using `updateClusters()`.
* Has an `outFields` option for the Features returned.
* Has an option to use the services default renderer for single features.
* And more, check source for more options.

![App](https://raw.github.com/odoe/esri-clusterfeaturelayer/master/demo.png)

## All options
* `url` *required* - Will generate clusters based on Features returned from map service.
* `MODE_SNAPSHOT` *optional* - Will download and cache all features in service
  to draw clusters much quicker. Takes a little longer to loader, but improves
performance during continued usage. Use `updateClusters()` to refresh clusters
with service. Default is `true`.
* `outFields` *optional* - Defines what fields are returned with Features. Deafult
is `['*']`.
* `objectIdField` *optional* - Defines the `OBJECTID` field of service. Default is 'OBJECTID'.
* `where` *optional* - Where clause for query. Default is `null`.
* `useDefaultSymbol` *optional* - Use the services default symbology for single features. Default is `false`.
* `returnLimit` *optional* - Return limit of features returned from query. Default is `1000`.
* `distance` *optional* - The max number of pixels between points to group points in the same cluster. Default value is `50`.
* `labelColor` *optional* - Hex string or array of rgba values used as the color for cluster labels. Default value is #fff (white).
* `labelOffset` *optional* - Number of pixels to shift a cluster label vertically. Defaults to `-5` to align labels with circle symbols. Does not work in IE.
* `resolution` *required* - Width of a pixel in map coordinates. Example of how to calculate: `map.extent.getWidth() / map.width`.
* `showSingles` *optional* - Whether or graphics should be displayed when a cluster graphic is clicked. Default is `true`.
* `zoomOnClick` *optionl* - Will zoom the map when a cluster graphic is clicked. Default is `true`.
* `singleSymbol` *optional* - Symbol to use for graphics that represent single points. Default is a small gray SimpleMarkerSymbol.
* `singleRenderer` *optional* - Can provide a renderer for single features to override the default renderer.
* `singleTemplate` *optional*  Popup template used to format attributes for graphics that represent single points. Default shows all attributes as 'attribute = value' (not recommended).
* `maxSingles` *optional* Threshold for whether or not to show graphics for points in a cluster. Default is `1000`.
* `font` *optional* Font to use for TextSymbol. Default is 10pt, Arial.
* `spatialReferenc` *optional* Spatial reference for all graphics in the layer. This has to match the spatial reference of the map. Default is 102100. Omit this if the map uses basemaps in web mercator.

## Events
* `clusters-shown` - fires when clusters have been drawn and shown on map. Fires
  after the map extent changes.
* `details-loaded` - fires when the layer has downloaded the default renderer properties from the service.

## Notes
Although this behaves similar to a FeatureLayer, it does not have all the
optimizations of a FeatureLayer. There is no [Vector Tiling](https://developers.arcgis.com/javascript/jshelp/best_practices_feature_layers.html) for the points. ~~A possible optimization could be to break up the request by `objectIds` in to multiple queries.~~
I added the ability to send requests by `objectIds` in chunks of 1000 by default. Can be set in options. I also added a cache for clustered graphics and a `clearCache()` method.


## Demo
A demo can be seen [here](http://odoe.github.io/esri-clusterfeaturelayer/).
