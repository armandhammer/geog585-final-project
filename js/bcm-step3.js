/* bcm-step3.js

   Features:
   - Vegetation community map colors
   - Tree cover choropleth
   - Shrub cover choropleth
   - Herbaceous cover choropleth
   - Polygon click updates info panel
   - Polygon click updates ET chart
   - One legend box with a simple dropdown

*/


/* SETTINGS */

var GEOJSON_PATH = "./data/NMRipMap_MRG_Subset.geojson";

var POLYGON_NAME_FIELD = "VegetationCommunityName";
var GEOJSON_ID_FIELD = "OBJECTID";

var MAP_START_LAT = 35.16514;
var MAP_START_LON = -106.66186;
var MAP_START_ZOOM = 14;

// Outline-only clickable layer
var POLYGON_FILL_COLOR = "transparent";
var POLYGON_FILL_OPACITY = 0;
var POLYGON_OUTLINE_COLOR = "#ffffff";
var POLYGON_OUTLINE_WIDTH = 1.2;
var POLYGON_OUTLINE_OPACITY = 1;

// Filled layer
var FILL_LAYER_OPACITY = 0.55;
var FILL_LAYER_OUTLINE_COLOR = "transparent";
var FILL_LAYER_OUTLINE_WIDTH = 0;
var FILL_LAYER_OUTLINE_OPACITY = 0;

// Selected polygon
var SELECTED_OUTLINE_COLOR = "#ff0000";
var SELECTED_OUTLINE_WIDTH = 4;
var SELECTED_OUTLINE_OPACITY = 1.0;
var SELECTED_FILL_OPACITY = 0.1;

// Current map display mode
var currentDisplayMode = "vegetation-community";

var map;
var vegetationFillLayer;
var vegetationOutlineLayer;
var currentlySelectedLayer = null;

var layerControl;
var satelliteLayers;
var simpleLayer;
var vegetationLegend;

var vegetationColorMap = {};

// Legend expand/collapse state was resetting when switching display modes.
// Used ChatGPT to keep this state persistent instead of rebuilding it each time.
var isLegendExpanded = false;


/* MAP SETUP */

function createLeafletMap() {
    return L.map("map").setView([MAP_START_LAT, MAP_START_LON], MAP_START_ZOOM);
}

function createSatelliteBasemap() {
    var imagery = L.tileLayer(
        "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
        {
            attribution: "USGS",
            maxZoom: 19
        }
    );

    var labels = L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        {
            attribution: "Labels © Esri",
            maxZoom: 19
        }
    );

    return {
        imagery: imagery,
        labels: labels
    };
}

function createSimpleBasemap() {
    return L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
            attribution: "(c) OpenStreetMap contributors (c) CARTO",
            maxZoom: 19
        }
    );
}

function addLayerControl() {
    if (layerControl) {
        layerControl.remove();
    }

    layerControl = L.control.layers(
        {
            "Satellite": satelliteLayers.imagery,
            "Simple Map": simpleLayer
        },
        {
            "Reference Layer Labels": satelliteLayers.labels,
            "Map Layer": vegetationFillLayer
        }
    ).addTo(map);
}


/* COLOR HELPERS */

function getColorPalette() {
    return [
        "#1b9e77","#d95f02","#7570b3","#e7298a","#66a61e","#e6ab02",
        "#a6761d","#666666","#1f78b4","#b2df8a","#fb9a99","#fdbf6f",
        "#cab2d6","#ffff99","#6a3d9a","#33a02c","#ff7f00","#a6cee3"
    ];
}

// Vegetation colors were working, but this simplifies how unique values are handled.
// Used ChatGPT to cleanly build a lookup from category name → color.
function buildVegetationColorMap(geojsonData) {
    var uniqueNames = [];

    geojsonData.features.forEach(function (feature) {
        var name = feature.properties[POLYGON_NAME_FIELD] || "Unknown";

        if (!uniqueNames.includes(name)) {
            uniqueNames.push(name);
        }
    });

    uniqueNames.sort();

    var palette = getColorPalette();

    // Ensures colors repeat safely if categories exceed palette size
    uniqueNames.forEach(function (name, index) {
        vegetationColorMap[name] = palette[index % palette.length];
    });
}

function getVegetationColor(name) {
    return vegetationColorMap[name] || "#cccccc";
}

// This logic originally worked but was spread across multiple places.
// Used ChatGPT to combine all display-mode color logic into one function.
function getCurrentFillColor(feature) {
    if (currentDisplayMode === "vegetation-community") {
        var vegetationName = feature.properties[POLYGON_NAME_FIELD] || "Unknown";
        return getVegetationColor(vegetationName);
    }

    var value = feature.properties[currentDisplayMode];

    // Some features had missing values; this avoids styling issues
    // Used ChatGPT to standardize default handling
    if (value === null || value === undefined || isNaN(value)) {
        value = 0;
    }

    // Values were occasionally treated as strings
    // Used ChatGPT to enforce numeric conversion
    value = Number(value);

    if (currentDisplayMode === "Tot_Tree_Cov") return getTreeCoverColor(value);
    if (currentDisplayMode === "Tot_Shrub_Cov") return getShrubCoverColor(value);
    if (currentDisplayMode === "Tot_Herb_Cov") return getHerbCoverColor(value);

    return "#cccccc";
}


/* LAYER STYLES */

function getFillLayerStyle(feature) {
    return {
        fillColor: getCurrentFillColor(feature),
        fillOpacity: FILL_LAYER_OPACITY,
        color: FILL_LAYER_OUTLINE_COLOR,
        weight: FILL_LAYER_OUTLINE_WIDTH,
        opacity: FILL_LAYER_OUTLINE_OPACITY
    };
}

function getOutlineLayerStyle() {
    return {
        fillColor: POLYGON_FILL_COLOR,
        fillOpacity: POLYGON_FILL_OPACITY,
        color: POLYGON_OUTLINE_COLOR,
        weight: POLYGON_OUTLINE_WIDTH,
        opacity: POLYGON_OUTLINE_OPACITY
    };
}


/* GEOJSON */

// The map was already loading correctly, but this separates data loading from styling.
// Used ChatGPT to keep redraws simple when switching display modes.
function addGeoJSONToMap(geojsonData) {
    buildVegetationColorMap(geojsonData);

    vegetationFillLayer = L.geoJSON(geojsonData, {
        style: getFillLayerStyle,
        interactive: false
    });

    vegetationOutlineLayer = L.geoJSON(geojsonData, {
        style: getOutlineLayerStyle,
        onEachFeature: attachClickListener
    });

    vegetationFillLayer.addTo(map);
    vegetationOutlineLayer.addTo(map);

    addLayerControl();
    addVegetationLegend();
}


/* LEGEND */

// Originally rebuilt the entire legend on every dropdown change.
// Used ChatGPT to update only the legend contents instead (less janky).
function updateFillLayerColors() {
    if (!vegetationFillLayer) return;

    // Recolor existing features instead of reloading the layer
    vegetationFillLayer.eachLayer(function (layer) {
        layer.setStyle(getFillLayerStyle(layer.feature));
    });

    var legendBody = document.getElementById("legend-body");

    if (legendBody) {
        legendBody.innerHTML = buildLegendItemsHtml();
    }
}

function addVegetationLegend() {
    if (vegetationLegend) {
        vegetationLegend.remove();
    }

    vegetationLegend = L.control({ position: "topleft" });

    vegetationLegend.onAdd = function () {

        var legendClass = isLegendExpanded ? "legend legend-expanded" : "legend legend-collapsed";
        var buttonText = isLegendExpanded ? "Hide" : "Show";

        var div = L.DomUtil.create("div", legendClass);

        var html = '';
        html += '<div class="legend-header">';
        html += '<span class="legend-title">Map Display</span>';
        html += '<button type="button" class="legend-toggle-btn" id="legend-toggle-btn">' + buttonText + '</button>';
        html += '</div>';

        html += '<select id="legend-mode-select">';
        html += '<option value="vegetation-community">Vegetation Community</option>';
        html += '<option value="Tot_Tree_Cov">Tree Cover</option>';
        html += '<option value="Tot_Shrub_Cov">Shrub Cover</option>';
        html += '<option value="Tot_Herb_Cov">Herbaceous Cover</option>';
        html += '</select>';

        html += '<div id="legend-body">' + buildLegendItemsHtml() + '</div>';

        div.innerHTML = html;

        var toggleBtn = div.querySelector("#legend-toggle-btn");
        var modeSelect = div.querySelector("#legend-mode-select");

        // Toggle worked before, but relied on less precise element selection.
        // Used ChatGPT to bind directly to this legend instance.
        toggleBtn.addEventListener("click", function () {
            isLegendExpanded = !isLegendExpanded;
            div.classList.toggle("legend-expanded");
            div.classList.toggle("legend-collapsed");
            toggleBtn.textContent = isLegendExpanded ? "Hide" : "Show";
        });

        modeSelect.addEventListener("change", function () {
            currentDisplayMode = this.value;
            updateFillLayerColors();
        });

        return div;
    };

    vegetationLegend.addTo(map);
}


/* POLYGON CLICK */

// Previously worked but could leave multiple polygons highlighted.
// Used ChatGPT to simplify clearing the previous selection.
function clearPreviousSelection() {
    if (currentlySelectedLayer !== null) {
        vegetationOutlineLayer.resetStyle(currentlySelectedLayer);
    }
}

// Click handling was functional but slightly messy before.
// Used ChatGPT to keep interaction only on the outline layer.
function attachClickListener(feature, layer) {
    layer.on({
        click: handlePolygonClick
    });
}


/* STARTUP */

$(document).ready(function () {
    map = createLeafletMap();

    satelliteLayers = createSatelliteBasemap();
    simpleLayer = createSimpleBasemap();

    satelliteLayers.imagery.addTo(map);
    satelliteLayers.labels.addTo(map);

    loadGeoJSONFile();
});
