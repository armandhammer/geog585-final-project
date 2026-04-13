/* ============================================================
   bcm-step1.js  -  STEP 1: Map + GeoJSON

   What this step does:
   - Creates the Leaflet map with satellite and simple basemaps
   - Loads the GeoJSON polygon file and draws it on the map
   - Displays the info panel shell on the right (no data yet)

   Not yet included:
   - Polygon selection or clicking
   - Info panel data
   - ET chart
   - Choropleth coloring
   ============================================================ */


/* PART 1: SETTINGS
   ---------------- */

var GEOJSON_PATH = "./data/RipMapMRG_small.geojson";

var MAP_START_LAT  = 35.106766;
var MAP_START_LON  = -106.629181;
var MAP_START_ZOOM = 10;

// Simple uniform style for all polygons - no choropleth yet
var POLYGON_FILL_COLOR   = "#52b788";   // flat green
var POLYGON_FILL_OPACITY = 0.5;
var POLYGON_OUTLINE_COLOR  = "#555555";
var POLYGON_OUTLINE_WIDTH  = 1;
var POLYGON_OUTLINE_OPACITY = 0.8;

// --- Global variables ---
var map;
var geojsonLayer;


/* PART 2: BUILDING THE MAP
   ------------------------ */
function createLeafletMap() {
    return L.map("map").setView([MAP_START_LAT, MAP_START_LON], MAP_START_ZOOM);
}

function createSatelliteBasemap() {
    return L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Imagery (c) Esri", maxZoom: 19 }
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


/* PART 3: LOADING AND DISPLAYING THE GEOJSON
   ------------------------------------------ */

// Returns the same simple style for every polygon.
// No data-driven coloring yet.
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
        style: getPolygonStyle
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


/* PART 4: INFO PANEL
   ------------------ */

// Shows the default state of the info panel.
// No polygon data yet - just the prompt to click a polygon.
function showDefaultInfoPanel() {
    $("#info-name").text("← Click a polygon on the map to see details");
    $("#info-tree").text("--");
    $("#info-shrub").text("--");
    $("#info-herb").text("--");
    $("#info-acres").text("--");
    $("#et-chart").html('<div class="et-placeholder">Select a polygon to view its ET trend</div>');
}


/* PART 5: STARTUP
   --------------- */

$(document).ready(function () {
    console.log("Step 1: Map + GeoJSON");

    map = createLeafletMap();
    var satelliteLayer = createSatelliteBasemap();
    var simpleLayer    = createSimpleBasemap();
    addStartingBasemap(satelliteLayer);
    addBasemapToggle(satelliteLayer, simpleLayer);

    showDefaultInfoPanel();
    loadGeoJSONFile();
});
