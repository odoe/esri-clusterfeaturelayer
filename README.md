# Esri ClusterFeatureLayer

This is a slightly revised version of the Cluster Example provided [here](https://developers.arcgis.com/javascript/jssamples/layers_point_clustering.html).

A couple of things I added:

* Works off a URL instead of a data option, like a [FeatureLayer](https://developers.arcgis.com/javascript/jsapi/featurelayer-amd.html).
* Option to a [Font](https://developers.arcgis.com/javascript/jsapi/font-amd.html) for the Clusters [TextSymbol](https://developers.arcgis.com/javascript/jsapi/textsymbol-amd.html). Default is `10pt` and `Arial`.
* A `zoomOnClick` option that will zoom the map 1 zoom level on the clicked
  cluster graphic.
* Has an `outFields` option for the Features returned.

Although this behaves similar to a FeatureLayer, it does not have all the
optimizations of a FeatureLayer. There is no [Vector Tiling](https://developers.arcgis.com/javascript/jshelp/best_practices_feature_layers.html) for the points. A possible optimization could be to break up the request by `objectIds` in to multiple queries.

A demo can be seen [here](http://odoe.github.io/esri-clusterfeaturelayer/).
