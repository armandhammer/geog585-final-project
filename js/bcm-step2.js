/* ============================================================
   bcm-step2.js  -  STEP 2: Polygon Selection + Info Panel

   What's new in this step:
   - Clicking a polygon highlights it with a bold red outline
   - Info panel fills in with vegetation type, cover %, and acreage
   - Only one polygon can be selected at a time

   Not yet included:
   - ET chart
   - Choropleth coloring
   ============================================================ */


/* ============================================================
   PART 1: SETTINGS
   ============================================================ */

var GEOJSON_PATH = "./data/RipMapMRG_small.geojson";

var POLYGON_NAME_FIELD = "VegetationCommunityName";
var GEOJSON_ID_FIELD   = "OBJECTID";

var MAP_START_LAT  = 35.106766;
var MAP_START_LON  = -106.629181;
var MAP_START_ZOOM = 10;

var STUDY_LATITUDE_DEGREES = 35.1;

// Uniform polygon style (no choropleth yet)
var POLYGON_FILL_COLOR    = "#52b788";
var POLYGON_FILL_OPACITY  = 0.5;
var POLYGON_OUTLINE_COLOR   = "#555555";
var POLYGON_OUTLINE_WIDTH   = 1;
var POLYGON_OUTLINE_OPACITY = 0.8;

// -- NEW IN STEP 2 ---------------------------------------------
// Style for the selected (clicked) polygon
var SELECTED_OUTLINE_COLOR   = "#ff0000";
var SELECTED_OUTLINE_WIDTH   = 4;
var SELECTED_OUTLINE_OPACITY = 1.0;
var SELECTED_FILL_OPACITY    = 0.75;
// -------------------------------------------------------------

// --- Global variables ---
var map;
var geojsonLayer;
var currentlySelectedLayer = null;   // -- NEW IN STEP 2


/* ============================================================
   PART 2: BUILDING THE MAP
   ============================================================ */

function createLeafletMap() {
    return L.map("map").setView([MAP_START_LAT, MAP_START_LON], MAP_START_ZOOM);
}

function createSatelliteBasemap() {
    return L.tileLayer(
        "https://gis.apfo.usda.gov/arcgis/rest/services/NAIP/USDA_CONUS_PRIME/ImageServer/tile/{z}/{y}/{x}",
        { attribution: "Imagery (c) USGS, USDA", maxZoom: 19 }
    );
}

function createSimpleBasemap() {
    return L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        { attribution: "(c) OpenStreetMap contributors (c) CARTO", maxZoom: 19 }
    );
}

function addStartingBasemap(satelliteLayer) {
    satelliteLayer.addTo(map);
}

function addBasemapToggle(satelliteLayer, simpleLayer) {
    L.control.layers(
        { "Satellite": satelliteLayer, "Simple Map": simpleLayer },
        {}
    ).addTo(map);
}


/* ============================================================
   PART 3: LOADING AND DISPLAYING THE GEOJSON
   ============================================================ */

function getPolygonStyle() {
    return {
        fillColor:   POLYGON_FILL_COLOR,
        fillOpacity: POLYGON_FILL_OPACITY,
        color:       POLYGON_OUTLINE_COLOR,
        weight:      POLYGON_OUTLINE_WIDTH,
        opacity:     POLYGON_OUTLINE_OPACITY
    };
}

function addGeoJSONToMap(geojsonData) {
    geojsonLayer = L.geoJSON(geojsonData, {
        style:         getPolygonStyle,
        onEachFeature: attachClickListener   // -- NEW IN STEP 2
    });
    geojsonLayer.addTo(map);
    map.fitBounds(geojsonLayer.getBounds());
    console.log("GeoJSON loaded and drawn on map.");
}

function loadGeoJSONFile() {
    console.log("Loading GeoJSON from:", GEOJSON_PATH);
    $.getJSON(GEOJSON_PATH, function (data) {
        addGeoJSONToMap(data);
    }).fail(function () {
        console.error("Failed to load GeoJSON from:", GEOJSON_PATH);
        alert("Could not load map data. Check the file path: " + GEOJSON_PATH);
    });
}


/* ============================================================
   PART 4: POLYGON SELECTION  -- NEW IN STEP 2
   ============================================================ */

function clearPreviousSelection() {
    if (currentlySelectedLayer !== null) {
        geojsonLayer.resetStyle(currentlySelectedLayer);
    }
}

function highlightPolygon(layer) {
    layer.setStyle({
        color:       SELECTED_OUTLINE_COLOR,
        weight:      SELECTED_OUTLINE_WIDTH,
        opacity:     SELECTED_OUTLINE_OPACITY,
        fillOpacity: SELECTED_FILL_OPACITY
    });
}

function handlePolygonClick(e) {
    var clickedLayer = e.target;

    clearPreviousSelection();
    highlightPolygon(clickedLayer);
    currentlySelectedLayer = clickedLayer;

    var props = clickedLayer.feature.properties;
    updateInfoPanel(props);
    // drawETChart() will be added in Step 3
}

function attachClickListener(feature, layer) {
    layer.on({ click: handlePolygonClick });
}


/* ============================================================
   PART 5: INFO PANEL  -- NEW IN STEP 2
   ============================================================ */

function formatAsPercent(value) {
    if (value === null || value === undefined) { return "--"; }
    return parseFloat(value).toFixed(1) + "%";
}

/* Used Claude AI to help with this function */
function convertSquareDegreesToAcres(shapeArea) {
    var latRad = STUDY_LATITUDE_DEGREES * (Math.PI / 180);
    var metersPerLatDeg = 110947;
    var metersPerLonDeg = Math.cos(latRad) * 111320;
    var sqMeters = shapeArea * metersPerLatDeg * metersPerLonDeg;
    return (sqMeters / 4046.86).toFixed(1);
}

function showDefaultInfoPanel() {
    $("#info-name").text("← Click a polygon on the map to see details");
    $("#info-tree").text("--");
    $("#info-shrub").text("--");
    $("#info-herb").text("--");
    $("#info-acres").text("--");
    $("#et-chart").html('<div class="et-placeholder">Select a polygon to view its ET trend</div>');
}

function updateInfoPanel(properties) {
    $("#info-name").text(properties[POLYGON_NAME_FIELD] || "Unknown");
    $("#info-tree").text(formatAsPercent(properties.Tot_Tree_Cov));
    $("#info-shrub").text(formatAsPercent(properties.Tot_Shrub_Cov));
    $("#info-herb").text(formatAsPercent(properties.Tot_Herb_Cov));
    $("#info-acres").text(convertSquareDegreesToAcres(properties.Shape_Area) + " acres");
}


/* ============================================================
   PART 6: STARTUP
   ============================================================ */

$(document).ready(function () {
    console.log("Step 2: Polygon Selection + Info Panel");

    map = createLeafletMap();
    var satelliteLayer = createSatelliteBasemap();
    var simpleLayer    = createSimpleBasemap();
    addStartingBasemap(satelliteLayer);
    addBasemapToggle(satelliteLayer, simpleLayer);

    showDefaultInfoPanel();
    loadGeoJSONFile();
});
