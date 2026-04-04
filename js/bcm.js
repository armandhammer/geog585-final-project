/* ============================================================

   bcm.js  -  Main JavaScript for the Riparian Ecosystems Map
              Middle Rio Grande  |  GEOG 585 Final Project

   This file is written in the order we actually built the app,
   step by step. If you read it top to bottom, it tells how the 
   page works:

     PART 1 - Settings and global variables
     PART 2 - Building the Leaflet map
     PART 3 - Adding choropleth (color-by-variable) controls
     PART 4 - Loading and displaying the GeoJSON polygons
     PART 5 - Selecting and highlighting a polygon
     PART 6 - Updating the info panel when a polygon is clicked
     PART 7 - Loading the ET (evapotranspiration) CSV data
     PART 8 - Drawing the ET chart with D3
     PART 9 - The startup function that runs when the page loads

   Each function does exactly ONE thing and has a name that
   describes what that thing is.

   ============================================================ */




/* ============================================================

   PART 1: SETTINGS AND GLOBAL VARIABLES

   Before writing any real code, we put all our settings in
   one place at the top. This way, if we need to change a
   filename, a color, or a field name, we only have to change
   it here - not hunt through the whole file.

   ============================================================ */

// ------------------------------------------------------------
// DATA FILE LOCATIONS
// These paths are relative to index.html (the dot means
// "same folder as index.html").
// ------------------------------------------------------------

var GEOJSON_PATH = "./data/RipMapMRG_small.geojson";   // our polygon map data
var ET_CSV_PATH  = "./data/et_data_small.csv";          // evapotranspiration time series


// ------------------------------------------------------------
// FIELD NAME SETTINGS
// These tell us which column in the GeoJSON to use for
// various purposes. If the data changes, update here only.
// ------------------------------------------------------------

// The GeoJSON property that holds the polygon's display name
var POLYGON_NAME_FIELD = "VegetationCommunityName";

// The GeoJSON property that links to poly_id in the CSV
// (We confirmed: OBJECTID in GeoJSON = poly_id in CSV)
var GEOJSON_ID_FIELD = "OBJECTID";


// ------------------------------------------------------------
// MAP STARTING VIEW
// Where the map is centered and how far zoomed in when it
// first loads. Coordinates are [latitude, longitude].
// ------------------------------------------------------------

var MAP_START_LAT  = 35.106766;    // center of the Middle Rio Grande study area
var MAP_START_LON  = -106.629181;
var MAP_START_ZOOM = 10;           // 10 = city-level zoom (1=world, 18=building)


// ------------------------------------------------------------
// ACRES CONVERSION SETTINGS
// Our GeoJSON uses WGS84 (decimal degrees), so Shape_Area is
// stored in square degrees - not square meters or acres.
// To convert, we need to know the approximate latitude of
// our study area so we can calculate the right scale.
// ------------------------------------------------------------

var STUDY_LATITUDE_DEGREES = 35.1;   // approximate center of our study area


// ------------------------------------------------------------
// ET CHART SETTINGS
// These control the appearance and labels of the D3 chart.
// ------------------------------------------------------------

var ET_YEAR_START = 2013;              // first year in our ET dataset
var ET_YEAR_END   = 2024;             // last year in our ET dataset
var ET_Y_AXIS_LABEL = "ET (mm/year)"; // label for the vertical axis


// ------------------------------------------------------------
// CHOROPLETH COLOR RAMPS
// Each variable gets an array with two colors:
//   [color for LOW values,  color for HIGH values]
// D3 will smoothly blend between these two colors.
// Colors were chosen to feel ecologically meaningful.
// ------------------------------------------------------------

var CHOROPLETH_COLORS = {
    "Tot_Tree_Cov":  ["#edf8e9", "#005a32"],   // light green  --> dark green
    "Tot_Shrub_Cov": ["#fee2c6", "#826434"],   // cream        --> dark brown
    "Tot_Herb_Cov":  ["#fbfbbd", "#b6d06c"]    // pale yellow  --> yellow-green
};

// Human-readable labels for those same three variables,
// used in the dropdown menu on the map
var CHOROPLETH_LABELS = {
    "Tot_Tree_Cov":  "% Tree Cover",
    "Tot_Shrub_Cov": "% Shrub Cover",
    "Tot_Herb_Cov":  "% Herbaceous Cover"
};


// ------------------------------------------------------------
// POLYGON STYLE SETTINGS
// Controls how polygons look on the map.
// ------------------------------------------------------------

// How unselected polygons look (outline only - fill comes from choropleth)
var NORMAL_POLYGON_OUTLINE_COLOR   = "#555555";   // dark grey outline
var NORMAL_POLYGON_OUTLINE_WIDTH   = 1;           // thin border
var NORMAL_POLYGON_OUTLINE_OPACITY = 0.8;
var NORMAL_POLYGON_FILL_OPACITY    = 0.65;

// How the selected (clicked) polygon looks
var SELECTED_OUTLINE_COLOR   = "#ff4400";   // bright red-orange
var SELECTED_OUTLINE_WIDTH   = 4;           // thick border so it's obvious
var SELECTED_OUTLINE_OPACITY = 1.0;
var SELECTED_FILL_OPACITY    = 0.75;


// ------------------------------------------------------------
// GLOBAL VARIABLES
// These are variables that multiple functions need to read
// and write. We declare them here so every function in 
// the file can access them.
// ------------------------------------------------------------

var map;                                  // will hold the Leaflet map object
var geojsonLayer;                         // will hold the GeoJSON polygon layer
var currentlySelectedLayer = null;        // which polygon is selected right now (null = none)
var currentChoroplethVariable = "Tot_Tree_Cov";  // which variable colors the map right now
var etData = [];                          // will hold the ET CSV data once loaded




/* ============================================================

   PART 2: BUILDING THE LEAFLET MAP

   Our first task is to build the map itself.
   We break this into small steps so each piece is clear:
     Step 1 - Create the map object and set its starting view
     Step 2 - Create the satellite basemap layer
     Step 3 - Create the simple/minimal basemap layer
     Step 4 - Add the starting basemap to the map
     Step 5 - Add a toggle so users can switch basemaps

   ============================================================ */


// ------------------------------------------------------------
// STEP 1: Create the Leaflet map
//
// L.map("map") tells Leaflet to take over the <div id="map">
// in our HTML and turn it into an interactive map.
// .setView() sets the starting center point and zoom level.
// ------------------------------------------------------------

function createLeafletMap() {
    var leafletMap = L.map("map").setView(
        [MAP_START_LAT, MAP_START_LON],
        MAP_START_ZOOM
    );
    return leafletMap;   // we return the map so we can store it in the global variable
}


// ------------------------------------------------------------
// STEP 2: Create the satellite basemap layer
//
// A "tile layer" is a basemap made up of small image tiles
// that Leaflet automatically loads as you pan and zoom.
// ESRI World Imagery is a satellite/aerial photo basemap -
// ideal for our project because users can see real tree
// canopy, shrubs, and land cover under our polygons.
// ------------------------------------------------------------

function createSatelliteBasemap() {
    var satelliteLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            attribution: "Imagery (c) Esri, DigitalGlobe, GeoEye, Earthstar Geographics",
            maxZoom: 19
        }
    );
    return satelliteLayer;
}


// ------------------------------------------------------------
// STEP 3: Create the simple/minimal basemap layer
//
// CartoDB Positron is a clean, light-colored basemap with
// no satellite imagery. It's useful when the choropleth
// colors need to stand out without visual noise underneath.
// ------------------------------------------------------------

function createSimpleBasemap() {
    var simpleLayer = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
            attribution: "(c) OpenStreetMap contributors (c) CARTO",
            maxZoom: 19
        }
    );
    return simpleLayer;
}


// ------------------------------------------------------------
// STEP 4: Add the starting basemap to the map
//
// We start with satellite because it's most informative for
// an ecological project. The user can switch later.
// ------------------------------------------------------------

function addStartingBasemap(satelliteLayer) {
    satelliteLayer.addTo(map);
}


// ------------------------------------------------------------
// STEP 5: Add the basemap toggle control
//
// L.control.layers() creates a small box in the corner
// of the map that lets users switch between basemaps.
// The first argument is the list of basemaps to choose from.
// The second argument (empty {}) would hold overlay layers.
// ------------------------------------------------------------

function addBasemapToggle(satelliteLayer, simpleLayer) {
    var basemapOptions = {
        "🛰 Satellite":  satelliteLayer,
        "🗺 Simple Map": simpleLayer
    };
    L.control.layers(basemapOptions, {}).addTo(map);
}




/* ============================================================

   PART 3: ADDING THE CHOROPLETH CONTROLS

   A choropleth map colors each polygon based on a data value.
   We need two things for this:
     Step 6 - A dropdown menu so the user can pick which
               variable to color the map by
     Step 7 - A color function that converts a numeric value
               into the right color from our ramp
     Step 8 - A style function that Leaflet calls for each
               polygon to get its complete style
     Step 9 - An update function that recolors all polygons
               when the user changes the dropdown

   ============================================================ */


// ------------------------------------------------------------
// STEP 6: Add the choropleth dropdown to the map
//
// Leaflet lets us add custom HTML elements to the map using
// L.control(). We create a <select> dropdown and place it
// in the top-left corner of the map.
//
// We also listen for changes to the dropdown - when the user
// picks a new variable, we call updateAllPolygonColors().
// ------------------------------------------------------------

function addChoroplethDropdown() {

    // L.control() creates a Leaflet "control" - an HTML element
    // that appears on top of the map at a fixed position.
    var dropdownControl = L.control({ position: "topleft" });

    // onAdd is a special function Leaflet calls when it's ready
    // to place our control on the map. We return the HTML we want.
    dropdownControl.onAdd = function () {

        // L.DomUtil.create() makes an HTML element. Here we make
        // a <div> with class "choropleth-control" (styled in main.css).
        var div = L.DomUtil.create("div", "choropleth-control");

        // Build the <option> tags for the dropdown,
        // one for each entry in our CHOROPLETH_LABELS object
        var optionsHTML = "";
        for (var fieldName in CHOROPLETH_LABELS) {
            optionsHTML += '<option value="' + fieldName + '">'
                         + CHOROPLETH_LABELS[fieldName]
                         + '</option>';
        }

        // Set the innerHTML of our div to a label + select element
        div.innerHTML = '<label>Color map by:</label>'
                      + '<select id="choropleth-select">'
                      + optionsHTML
                      + '</select>';

        // IMPORTANT: Without this line, clicking the dropdown would
        // also trigger a click on the map underneath, potentially
        // deselecting the currently highlighted polygon.
        L.DomEvent.disableClickPropagation(div);

        return div;
    };

    // Add the control to the map
    dropdownControl.addTo(map);

    // Listen for changes to the dropdown.
    // We attach the listener to "document" rather than directly
    // to "#choropleth-select" because the dropdown is created
    // after the page loads, and jQuery's .on() with "document"
    // handles elements that didn't exist yet at page load time.
    $(document).on("change", "#choropleth-select", function () {
        var chosenVariable = $(this).val();           // get the selected field name
        currentChoroplethVariable = chosenVariable;   // update our global "memory"
        updateAllPolygonColors();                     // recolor the map
    });
}


// ------------------------------------------------------------
// STEP 7: Calculate the color for a single value
//
// Given a numeric value (like 42.5% tree cover) and the name
// of a variable, this function returns the appropriate color
// by interpolating between that variable's two ramp colors.
//
// We use D3's scaleLinear for the color math. It's like a
// "color ruler" - 0% gives the light color, 100% gives the
// dark color, and everything in between is blended smoothly.
// ------------------------------------------------------------

function getColorForValue(value, variableName) {

    // Look up the [light color, dark color] array for this variable
    var colorRange = CHOROPLETH_COLORS[variableName];

    // Create a D3 linear color scale
    //   .domain([0, 100]) means: inputs range from 0 to 100 (percent)
    //   .range(colorRange) means: outputs range from light to dark color
    var colorScale = d3.scaleLinear()
        .domain([0, 100])
        .range(colorRange);

    // Pass our value into the scale to get back a color string like "#74c69d"
    return colorScale(value);
}


// ------------------------------------------------------------
// STEP 8: Build the full style object for one polygon
//
// Leaflet calls this function automatically for every polygon
// when it draws the GeoJSON layer. We return a "style object"
// - a plain JavaScript object with properties like fillColor,
// weight (border thickness), and opacity.
//
// The fill color comes from our getColorForValue() function
// using whichever variable is currently selected.
// ------------------------------------------------------------

function getPolygonStyle(feature) {

    // Get the value of the current choropleth variable for this polygon.
    // The "|| 0" means: if the value is missing/null, treat it as 0.
    var dataValue = feature.properties[currentChoroplethVariable] || 0;

    // Calculate the fill color based on that value
    var fillColor = getColorForValue(dataValue, currentChoroplethVariable);

    // Return the complete style object
    return {
        fillColor:   fillColor,
        fillOpacity: NORMAL_POLYGON_FILL_OPACITY,
        color:       NORMAL_POLYGON_OUTLINE_COLOR,    // outline color
        weight:      NORMAL_POLYGON_OUTLINE_WIDTH,    // outline thickness in pixels
        opacity:     NORMAL_POLYGON_OUTLINE_OPACITY   // outline opacity
    };
}


// ------------------------------------------------------------
// STEP 9: Recolor all polygons when the dropdown changes
//
// When the user picks a new choropleth variable, we need to
// loop through every polygon and update its fill color.
//
// We skip the currently selected polygon - we don't want to
// accidentally remove its red highlight.
// ------------------------------------------------------------

function updateAllPolygonColors() {

    // geojsonLayer.eachLayer() loops through every polygon.
    // The function inside runs once for each polygon.
    geojsonLayer.eachLayer(function (layer) {

        // Skip the selected polygon - keep its highlight
        if (layer === currentlySelectedLayer) {
            return;   // "return" inside eachLayer works like "continue" in a for-loop
        }

        // Apply the updated style (which uses the new variable)
        layer.setStyle(getPolygonStyle(layer.feature));
    });
}




/* ============================================================

   PART 4: LOADING AND DISPLAYING THE GEOJSON DATA

   Now that the map and controls are ready, we load our
   GeoJSON file and draw the polygons on the map.

   We use jQuery's $.getJSON() to load the file. This is
   "asynchronous" - it runs in the background while the rest
   of the page stays responsive, then calls our function
   when the data is ready.

   ============================================================ */


// ------------------------------------------------------------
// STEP 10: Add a loaded GeoJSON dataset to the map
//
// This function is called once the GeoJSON file has been
// loaded. It creates a Leaflet GeoJSON layer and adds it.
//
// The two options we pass in are:
//   style        - our getPolygonStyle() function, which
//                  Leaflet calls for each polygon to color it
//   onEachFeature - our attachClickListener() function, which
//                  Leaflet calls for each polygon to set up clicking
// ------------------------------------------------------------

function addGeoJSONToMap(geojsonData) {

    geojsonLayer = L.geoJSON(geojsonData, {
        style:         getPolygonStyle,     // color each polygon by the choropleth
        onEachFeature: attachClickListener  // wire up click behavior (defined in Part 5)
    });

    geojsonLayer.addTo(map);

    // fitBounds() automatically zooms and pans the map so all
    // polygons are visible. Much easier than guessing a zoom level!
    map.fitBounds(geojsonLayer.getBounds());

    console.log("GeoJSON loaded and drawn on map.");
}


// ------------------------------------------------------------
// STEP 11: Load the GeoJSON file from disk
//
// $.getJSON() is a jQuery shortcut for loading a JSON file.
// It takes two arguments:
//   1. The file path to load
//   2. A "callback" function to run when the data is ready
//
// We also chain .fail() to handle the case where the file
// doesn't load (wrong path, server error, etc.)
// ------------------------------------------------------------

function loadGeoJSONFile() {

    console.log("Loading GeoJSON from:", GEOJSON_PATH);

    $.getJSON(GEOJSON_PATH, function (data) {

        // This function runs when the file loads successfully.
        // "data" contains all the GeoJSON content.
        addGeoJSONToMap(data);

    }).fail(function () {

        // This runs if something went wrong loading the file.
        console.error("ERROR: Could not load GeoJSON from " + GEOJSON_PATH);
        alert("Could not load map data. Check that the file exists at: " + GEOJSON_PATH);

    });
}




/* ============================================================

   PART 5: SELECTING AND HIGHLIGHTING A POLYGON

   When the user clicks a polygon, we want to:
     1. Remove the highlight from whichever polygon was
        selected before (if any)
     2. Apply a bold red-orange highlight to the clicked one
     3. Remember which polygon is now selected

   We break this into separate functions so each step is clear.

   ============================================================ */


// ------------------------------------------------------------
// STEP 12: Remove the highlight from the previously
//          selected polygon
//
// geojsonLayer.resetStyle(layer) is a Leaflet function that
// re-applies the original style function (getPolygonStyle)
// to a layer, effectively removing any custom styling.
// ------------------------------------------------------------

function clearPreviousSelection() {

    // Only do something if a polygon is actually selected
    if (currentlySelectedLayer !== null) {
        geojsonLayer.resetStyle(currentlySelectedLayer);
        console.log("Cleared previous polygon selection.");
    }
}


// ------------------------------------------------------------
// STEP 13: Apply the highlight style to the clicked polygon
//
// We use layer.setStyle() to override just the outline
// properties with our bright red-orange selection style.
// The fill color from the choropleth is preserved.
// ------------------------------------------------------------

function highlightPolygon(layer) {

    layer.setStyle({
        color:       SELECTED_OUTLINE_COLOR,    // bright red-orange outline
        weight:      SELECTED_OUTLINE_WIDTH,    // thick border
        opacity:     SELECTED_OUTLINE_OPACITY,
        fillOpacity: SELECTED_FILL_OPACITY
    });

    console.log("Polygon highlighted.");
}


// ------------------------------------------------------------
// STEP 14: Handle a polygon click event
//
// This is the main click handler. Leaflet calls it every time
// the user clicks any polygon on the map.
//
// "e" is the event object. e.target is the polygon that
// was actually clicked.
//
// This function coordinates all the things that need to happen:
//   1. Clear the old selection
//   2. Highlight the new selection
//   3. Remember the new selection
//   4. Update the info panel
//   5. Redraw the ET chart
// ------------------------------------------------------------

function handlePolygonClick(e) {

    var clickedLayer = e.target;   // the polygon that was clicked

    // Step 1: Remove the highlight from the old selection
    clearPreviousSelection();

    // Step 2: Highlight the newly clicked polygon
    highlightPolygon(clickedLayer);

    // Step 3: Remember which polygon is now selected
    currentlySelectedLayer = clickedLayer;

    // Step 4: Update the info panel on the right side of the screen
    // We pass in the polygon's properties (its attribute data)
    var polygonProperties = clickedLayer.feature.properties;
    updateInfoPanel(polygonProperties);

    // Step 5: Redraw the ET chart for this polygon
    // We need the OBJECTID so we can match it to poly_id in the CSV
    var polygonID = polygonProperties[GEOJSON_ID_FIELD];
    drawETChart(polygonID);
}


// ------------------------------------------------------------
// STEP 15: Attach a click listener to each polygon
//
// Leaflet calls this function once for every polygon as it
// loads the GeoJSON (via the onEachFeature option in Step 10).
//
// We use layer.on({ click: ... }) to say:
// "when this polygon is clicked, call handlePolygonClick"
// ------------------------------------------------------------

function attachClickListener(feature, layer) {
    layer.on({
        click: handlePolygonClick
    });
}




/* ============================================================

   PART 6: UPDATING THE INFO PANEL

   When the user clicks a polygon, the right-side info panel
   should fill in with that polygon's data.

   We also need some helper functions for formatting the data
   (converting to percentages, calculating acres, etc.)

   ============================================================ */


// ------------------------------------------------------------
// HELPER: Convert a raw decimal to a "XX.X%" string
//
// The GeoJSON stores cover values as decimals like 6.7196717.
// We want to display them as "6.7%".
// The .toFixed(1) method rounds to 1 decimal place.
// ------------------------------------------------------------

function formatAsPercent(value) {
    if (value === null || value === undefined) {
        return "--";   // show a dash if data is missing
    }
    return parseFloat(value).toFixed(1) + "%";
}


// ------------------------------------------------------------
// HELPER: Convert Shape_Area (in square degrees) to acres
//
// GeoJSON in WGS84 stores area in square degrees, not square
// meters or acres. To convert, we use the scale factor at
// our study area's latitude (~35°N).
//
// At 35°N:
//   1 degree of latitude ≈ 110,947 meters
//   1 degree of longitude ≈ cos(35°) × 111,320 ≈ 91,145 meters
//
// So: square_degrees × meters_per_lat_degree × meters_per_lon_degree
//       = square meters
//     square_meters ÷ 4046.86 = acres
// ------------------------------------------------------------

function convertSquareDegreesToAcres(shapeArea) {

    // Convert our latitude setting from degrees to radians
    // (Math functions in JavaScript expect radians, not degrees)
    var latitudeInRadians = STUDY_LATITUDE_DEGREES * (Math.PI / 180);

    // How many meters in one degree at this latitude
    var metersPerLatDegree = 110947;
    var metersPerLonDegree = Math.cos(latitudeInRadians) * 111320;

    // Calculate area in square meters
    var areaInSquareMeters = shapeArea * metersPerLatDegree * metersPerLonDegree;

    // Convert square meters to acres
    var areaInAcres = areaInSquareMeters / 4046.86;

    // Return rounded to 1 decimal place, e.g. "3.9"
    return areaInAcres.toFixed(1);
}


// ------------------------------------------------------------
// STEP 16: Show the default info panel message
//
// Before any polygon is clicked, the info panel should show
// a helpful prompt telling the user what to do.
// We put this in its own function so we can call it at startup.
// ------------------------------------------------------------

function showDefaultInfoPanel() {
    $("#info-name").text("← Click a polygon on the map to see details");
    $("#info-tree").text("--");
    $("#info-shrub").text("--");
    $("#info-herb").text("--");
    $("#info-acres").text("--");

    // Also show the placeholder in the ET chart area
    $("#et-chart").html(
        '<div class="et-placeholder">Select a polygon to view its ET trend</div>'
    );
}


// ------------------------------------------------------------
// STEP 17: Fill the info panel with a polygon's data
//
// jQuery's $() selects an HTML element by its id.
// .text() sets the text content of that element.
//
// We update one field at a time so it's easy to see
// which piece of HTML each value goes to.
// ------------------------------------------------------------

function updateInfoPanel(properties) {

    // --- Vegetation community name ---
    // Use the configured field name, or "Unknown" if it's missing
    var vegName = properties[POLYGON_NAME_FIELD] || "Unknown";
    $("#info-name").text(vegName);

    // --- Tree cover percentage ---
    $("#info-tree").text(formatAsPercent(properties.Tot_Tree_Cov));

    // --- Shrub cover percentage ---
    $("#info-shrub").text(formatAsPercent(properties.Tot_Shrub_Cov));

    // --- Herbaceous cover percentage ---
    $("#info-herb").text(formatAsPercent(properties.Tot_Herb_Cov));

    // --- Area in acres ---
    // Shape_Area is in square degrees, so we convert it first
    var acres = convertSquareDegreesToAcres(properties.Shape_Area);
    $("#info-acres").text(acres + " acres");

    console.log("Info panel updated for:", vegName);
}




/* ============================================================

   PART 7: LOADING THE ET DATA

   Now we load our second data file: the CSV containing
   Evapotranspiration (ET) values over time for each polygon.

   A few things to handle:
   - d3.csv() reads all values as strings - we need to convert
     numbers to actual JavaScript numbers
   - Some values are "NA" (no data for that year) - we need to
     convert those to null so we can skip them in the chart

   ============================================================ */


// ------------------------------------------------------------
// HELPER: Check whether a value is a usable number
//
// In our CSV, missing values are stored as the string "NA".
// JavaScript's built-in isNaN() doesn't handle "NA" well,
// so we write our own simple check.
// ------------------------------------------------------------

function isUsableNumber(value) {
    if (value === null)      { return false; }
    if (value === undefined) { return false; }
    if (value === "NA")      { return false; }
    if (value === "")        { return false; }
    if (isNaN(parseFloat(value))) { return false; }
    return true;   // if we passed all the checks above, it's a real number
}


// ------------------------------------------------------------
// STEP 18: Load the ET CSV file
//
// d3.csv() loads a CSV file and returns an array of objects,
// one object per row. For example, one row might look like:
//   { poly_id: "4", year: "2013", mean: "561.2", ... }
//
// Notice everything is a string. We convert numbers inside
// the callback function.
// ------------------------------------------------------------

function loadETData() {

    console.log("Loading ET data from:", ET_CSV_PATH);

    d3.csv(ET_CSV_PATH, function (error, rows) {

        // If the file couldn't be loaded, log the error and stop
        if (error) {
            console.error("ERROR: Could not load ET data:", error);
            return;
        }

        // Loop through every row and convert strings to numbers
        rows.forEach(function (row) {

            // poly_id and year are always numbers, so convert directly
            // The "+" in front is a quick way to convert string --> number
            row.poly_id = +row.poly_id;
            row.year    = +row.year;

            // For mean/p25/p75/npix, check for "NA" first.
            // If it's "NA", store null. Otherwise, convert to number.
            row.mean = isUsableNumber(row.mean) ? +row.mean : null;
            row.p25  = isUsableNumber(row.p25)  ? +row.p25  : null;
            row.p75  = isUsableNumber(row.p75)  ? +row.p75  : null;
            row.npix = isUsableNumber(row.npix) ? +row.npix : null;
        });

        // Store the processed rows in our global etData array
        etData = rows;

        console.log("ET data loaded successfully:", etData.length, "rows");
    });
}




/* ============================================================

   PART 8: DRAWING THE ET CHART WITH D3

   When the user clicks a polygon, we draw a line chart
   showing that polygon's ET values from 2013 to 2024.

   The chart has three visual elements:
     1. A shaded ribbon - the range between p25 and p75
        (shows how spread out the values were across pixels)
     2. A line - the mean ET value per year
     3. Dots - one per year, with a tooltip showing the value

   We break the chart into small sub-functions so each piece
   is clear and easy to understand on its own.

   ============================================================ */


// ------------------------------------------------------------
// STEP 19: Get the ET data rows for one specific polygon
//
// etData contains rows for ALL polygons. This function
// filters it down to just the rows for the polygon we want.
// ------------------------------------------------------------

function getETRowsForPolygon(polygonID) {
    var polygonRows = etData.filter(function (row) {
        return row.poly_id === polygonID;
    });
    return polygonRows;
}


// ------------------------------------------------------------
// STEP 20: Get only the rows that have a valid mean value
//
// Some rows have mean = null (originally "NA" in the CSV).
// The chart can't plot null values, so we filter them out.
// The line will simply show a gap where data is missing.
// ------------------------------------------------------------

function getValidETRows(allRows) {
    var validRows = allRows.filter(function (row) {
        return row.mean !== null;
    });
    return validRows;
}


// ------------------------------------------------------------
// STEP 21: Create the SVG drawing area inside the chart div
//
// D3 charts are drawn in SVG (Scalable Vector Graphics).
// We create an <svg> element inside #et-chart, then add
// a <g> (group) element shifted inward by the margin amount.
// This gives us room for the axis labels on the edges.
// ------------------------------------------------------------

function createChartSVG(totalWidth, totalHeight, margin) {

    // Create the SVG element and set its total size
    var svg = d3.select("#et-chart")
        .append("svg")
        .attr("width",  totalWidth)
        .attr("height", totalHeight);

    // Add a group element shifted in by the margins.
    // Everything else (axes, lines, dots) will be added to
    // this group so they're automatically offset correctly.
    var chartGroup = svg.append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    return chartGroup;
}


// ------------------------------------------------------------
// STEP 22: Create the X scale (years --> pixel positions)
//
// A D3 "scale" is a function that maps data values to
// pixel positions on screen.
//
// For the X axis: years (2013–2024) map to horizontal pixels.
// ------------------------------------------------------------

function createXScale(chartWidth) {
    var xScale = d3.scaleLinear()
        .domain([ET_YEAR_START, ET_YEAR_END])   // input: year range
        .range([0, chartWidth]);                 // output: pixel range
    return xScale;
}


// ------------------------------------------------------------
// STEP 23: Create the Y scale (ET values --> pixel positions)
//
// For the Y axis: ET values (0 to max) map to vertical pixels.
// Note: SVG's Y axis is flipped - 0 is at the top, so we
// set .range([chartHeight, 0]) to flip it right-side up.
// ------------------------------------------------------------

function createYScale(validRows, chartHeight) {

    // Find the highest value across all valid p75 values
    // (p75 is the top of the ribbon, so it's the highest point)
    var maxValue = d3.max(validRows, function (d) {
        return d.p75 !== null ? d.p75 : d.mean;
    });

    var yScale = d3.scaleLinear()
        .domain([0, maxValue * 1.1])   // 0 to max, plus 10% headroom
        .range([chartHeight, 0]);       // pixel range, flipped so 0 is at bottom
    return yScale;
}


// ------------------------------------------------------------
// STEP 24: Draw the X axis (years) at the bottom of the chart
// ------------------------------------------------------------

function drawXAxis(chartGroup, xScale, chartHeight) {

    chartGroup.append("g")
        .attr("class", "axis")
        // Move the axis to the bottom of the chart area
        .attr("transform", "translate(0," + chartHeight + ")")
        .call(
            d3.axisBottom(xScale)
                .tickFormat(d3.format("d"))          // "d" = integer format (no decimals)
                .ticks(ET_YEAR_END - ET_YEAR_START)  // one tick mark per year
        );
}


// ------------------------------------------------------------
// STEP 25: Draw the Y axis (ET values) on the left side
// ------------------------------------------------------------

function drawYAxis(chartGroup, yScale, margin, chartHeight) {

    // Draw the axis line and tick marks
    chartGroup.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(yScale).ticks(5));   // 5 tick marks on the Y axis

    // Add a rotated text label along the left side
    chartGroup.append("text")
        .attr("transform", "rotate(-90)")   // rotate 90° counter-clockwise
        .attr("y", -margin.left + 15)       // position to the left of the axis
        .attr("x", -(chartHeight / 2))      // center vertically along the axis
        .attr("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "#555")
        .text(ET_Y_AXIS_LABEL);
}


// ------------------------------------------------------------
// STEP 26: Draw the shaded ribbon between p25 and p75
//
// The ribbon shows the "interquartile range" - the spread
// of ET values across all pixels within the polygon.
// A wide ribbon means ET varied a lot across the polygon.
//
// d3.area() creates a filled shape. .defined() tells D3 to
// skip (leave a gap for) any rows where p25 or p75 is null.
// ------------------------------------------------------------

function drawRibbon(chartGroup, allRows, xScale, yScale) {

    var ribbonGenerator = d3.area()
        // .defined() controls which data points to include
        // If either p25 or p75 is null, skip this point
        .defined(function (d) {
            return d.p25 !== null && d.p75 !== null;
        })
        .x(function  (d) { return xScale(d.year); })   // horizontal position
        .y0(function (d) { return yScale(d.p25);  })   // bottom edge of ribbon
        .y1(function (d) { return yScale(d.p75);  });  // top edge of ribbon

    chartGroup.append("path")
        .datum(allRows)                  // .datum() passes the whole array at once
        .attr("fill", "#b7e4c7")         // light green fill
        .attr("fill-opacity", 0.4)       // semi-transparent
        .attr("stroke", "none")          // no outline on the ribbon
        .attr("d", ribbonGenerator);     // "d" is the SVG path attribute
}


// ------------------------------------------------------------
// STEP 27: Draw the mean ET line
//
// d3.line() creates a path through all the data points.
// .defined() causes D3 to lift the pen at null values -
// leaving a visible gap rather than dropping to zero.
// ------------------------------------------------------------

function drawMeanLine(chartGroup, allRows, xScale, yScale) {

    var lineGenerator = d3.line()
        .defined(function (d) { return d.mean !== null; })  // skip NA rows
        .x(function (d) { return xScale(d.year); })
        .y(function (d) { return yScale(d.mean); });

    chartGroup.append("path")
        .datum(allRows)
        .attr("fill", "none")            // lines have no fill
        .attr("stroke", "#40916c")       // medium green line
        .attr("stroke-width", 2)
        .attr("d", lineGenerator);
}


// ------------------------------------------------------------
// STEP 28: Draw the dots on the mean line
//
// One circle per year that has a valid mean value.
// Hovering over a dot shows a tooltip with the year and value.
// NA years don't get a dot - we only use validRows here.
// ------------------------------------------------------------

function drawDots(chartGroup, validRows, xScale, yScale) {

    chartGroup.selectAll("circle")     // select all circles (none exist yet)
        .data(validRows)               // bind our data to the selection
        .enter()                       // for each data point not yet drawn...
        .append("circle")              // ...add a circle
        .attr("cx", function (d) { return xScale(d.year); })   // X position
        .attr("cy", function (d) { return yScale(d.mean); })   // Y position
        .attr("r", 4)                                           // radius in pixels
        .attr("fill", "#1b4332")                               // dark green dot
        .attr("stroke", "white")                               // white ring around dot
        .attr("stroke-width", 1.5)
        // Add a <title> element inside each circle.
        // Browsers show this as a tooltip when you hover over the dot.
        .append("title")
        .text(function (d) {
            return d.year + ": " + Math.round(d.mean) + " mm/yr";
        });
}


// ------------------------------------------------------------
// STEP 29: Draw the complete ET chart for one polygon
//
// This is the main chart function. It calls all the helper
// functions above in order to build the chart piece by piece.
//
// Think of this as the "director" - it doesn't do the drawing
// itself, but it calls the right functions in the right order.
// ------------------------------------------------------------

function drawETChart(polygonID) {

    // --- Clear whatever was in the chart area before ---
    $("#et-chart").empty();

    // --- Get the data for this polygon ---
    var allRows   = getETRowsForPolygon(polygonID);
    var validRows = getValidETRows(allRows);

    // --- Handle edge cases ---

    // Case 1: No data at all for this polygon
    if (allRows.length === 0) {
        $("#et-chart").html('<div class="et-placeholder">No ET data for this polygon</div>');
        return;
    }

    // Case 2: Data exists but every year is NA
    if (validRows.length === 0) {
        $("#et-chart").html('<div class="et-placeholder">All ET values are NA for this polygon</div>');
        return;
    }

    // --- Set up the chart dimensions ---
    // We use margins to leave room for the axis labels.
    // The "inner" width and height are where the actual data goes.
    var margin     = { top: 15, right: 20, bottom: 40, left: 65 };
    var totalWidth  = document.getElementById("et-chart").offsetWidth || 400;
    var totalHeight = 185;
    var chartWidth  = totalWidth  - margin.left - margin.right;
    var chartHeight = totalHeight - margin.top  - margin.bottom;

    // --- Build the chart piece by piece ---

    // Step A: Create the SVG drawing canvas
    var chartGroup = createChartSVG(totalWidth, totalHeight, margin);

    // Step B: Create scales (data values --> pixel positions)
    var xScale = createXScale(chartWidth);
    var yScale = createYScale(validRows, chartHeight);

    // Step C: Draw the axes
    drawXAxis(chartGroup, xScale, chartHeight);
    drawYAxis(chartGroup, yScale, margin, chartHeight);

    // Step D: Draw the data - ribbon first (behind), then line and dots on top
    drawRibbon(chartGroup, allRows,   xScale, yScale);
    drawMeanLine(chartGroup, allRows, xScale, yScale);
    drawDots(chartGroup, validRows,   xScale, yScale);

    console.log("ET chart drawn for polygon ID:", polygonID,
                "| Valid years:", validRows.length,
                "| NA years:", allRows.length - validRows.length);
}




/* ============================================================

   PART 9: THE STARTUP FUNCTION

   This is where everything comes together.

   $(document).ready() is a jQuery function that waits until
   the browser has completely finished building the HTML page
   before running any of our code. Without this, our JavaScript
   might try to interact with elements (like the map div or
   info panel divs) before they exist, causing errors.

   We call our functions in the same logical order we built them:
   first the map, then the controls, then load the data.

   ============================================================ */

$(document).ready(function () {

    console.log("Page loaded. Starting app setup...");

    // --------------------------------------------------------
    // PHASE 1: Build the map
    // --------------------------------------------------------

    // Create the Leaflet map centered on the Middle Rio Grande
    map = createLeafletMap();
    console.log("Map created.");

    // Create both basemap tile layers
    var satelliteLayer = createSatelliteBasemap();
    var simpleLayer    = createSimpleBasemap();

    // Start with the satellite basemap visible
    addStartingBasemap(satelliteLayer);

    // Add the toggle so users can switch between basemaps
    addBasemapToggle(satelliteLayer, simpleLayer);
    console.log("Basemaps added.");

    // --------------------------------------------------------
    // PHASE 2: Add the choropleth dropdown control
    // --------------------------------------------------------

    addChoroplethDropdown();
    console.log("Choropleth dropdown added.");

    // --------------------------------------------------------
    // PHASE 3: Set the info panel to its default state
    // --------------------------------------------------------

    // Before any polygon is clicked, show the "click a polygon"
    // instructions in the info panel
    showDefaultInfoPanel();
    console.log("Info panel set to default state.");

    // --------------------------------------------------------
    // PHASE 4: Load the ET data in the background
    // --------------------------------------------------------

    // This loads the CSV into the global etData array.
    // It runs asynchronously - the page stays responsive while
    // it loads, and the data will be ready long before the user
    // clicks their first polygon.
    loadETData();

    // --------------------------------------------------------
    // PHASE 5: Load the GeoJSON and draw the polygons
    // --------------------------------------------------------

    // This is the last step because the polygons need the map
    // to already exist before they can be added to it.
    // The choropleth and click listeners are attached here too.
    loadGeoJSONFile();

    console.log("App setup complete. Waiting for GeoJSON and ET data to finish loading...");

});
