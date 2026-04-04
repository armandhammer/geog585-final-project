/* ============================================================
   bcm.js  -  Riparian Ecosystems Map  |  GEOG 585 Final Project

   ORGANIZATION:
   Part 1 - Settings and global variables
   Part 2 - Building the Leaflet map
   Part 3 - Choropleth controls and coloring
   Part 4 - Loading and displaying the GeoJSON
   Part 5 - Polygon selection and highlighting
   Part 6 - Info panel updates
   Part 7 - Loading the ET CSV data
   Part 8 - Drawing the ET chart with D3
   Part 9 - Startup function
   ============================================================ */


/* ============================================================
   PART 1: SETTINGS AND GLOBAL VARIABLES
   All configuration lives here so it's easy to find and change.
   ============================================================ */

// --- Data files ---
var GEOJSON_PATH = "./data/RipMapMRG_small.geojson";
var ET_CSV_PATH  = "./data/et_data_small.csv";

// --- GeoJSON field names ---
var POLYGON_NAME_FIELD = "VegetationCommunityName";  // displayed in info panel header
var GEOJSON_ID_FIELD   = "OBJECTID";                 // links to poly_id in the CSV

// --- Map starting position ---
var MAP_START_LAT  = 35.106766;
var MAP_START_LON  = -106.629181;
var MAP_START_ZOOM = 10;

// --- Acres conversion ---
// Shape_Area in the GeoJSON is in square degrees (WGS84).
// We convert using the scale factor at our study latitude.
var STUDY_LATITUDE_DEGREES = 35.1;

// --- ET chart ---
var ET_YEAR_START   = 2013;
var ET_YEAR_END     = 2024;
var ET_Y_AXIS_LABEL = "ET (mm/year)";

// --- Choropleth color ramps: [low color, high color] ---
var CHOROPLETH_COLORS = {
    "Tot_Tree_Cov":  ["#edf8e9", "#005a32"],   // light green → dark green
    "Tot_Shrub_Cov": ["#fff5eb", "#7f2704"],   // cream → dark brown
    "Tot_Herb_Cov":  ["#ffffe5", "#78c679"]    // pale yellow → yellow-green
};

// Labels for the dropdown menu
var CHOROPLETH_LABELS = {
    "Tot_Tree_Cov":  "% Tree Cover",
    "Tot_Shrub_Cov": "% Shrub Cover",
    "Tot_Herb_Cov":  "% Herbaceous Cover"
};

// --- Polygon appearance ---
var NORMAL_OUTLINE_COLOR   = "#555555";
var NORMAL_OUTLINE_WIDTH   = 1;
var NORMAL_OUTLINE_OPACITY = 0.8;
var NORMAL_FILL_OPACITY    = 0.65;

var SELECTED_OUTLINE_COLOR   = "#ff4400";   // bold red-orange for selected polygon
var SELECTED_OUTLINE_WIDTH   = 4;
var SELECTED_OUTLINE_OPACITY = 1.0;
var SELECTED_FILL_OPACITY    = 0.75;

// --- Global state variables ---
// These are declared at the top level so all functions can access them.
var map;
var geojsonLayer;
var currentlySelectedLayer  = null;
var currentChoroplethVariable = "Tot_Tree_Cov";
var etData = [];


/* ============================================================
   PART 2: BUILDING THE LEAFLET MAP
   ============================================================ */

// Creates the Leaflet map centered on the Middle Rio Grande.
function createLeafletMap() {
    var leafletMap = L.map("map").setView(
        [MAP_START_LAT, MAP_START_LON],
        MAP_START_ZOOM
    );
    return leafletMap;
}

// ESRI satellite - best for ecological work (visible canopy and land cover).
function createSatelliteBasemap() {
    return L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            attribution: "Imagery © Esri, DigitalGlobe, GeoEye",
            maxZoom: 19
        }
    );
}

// CartoDB Positron - clean and minimal, good for seeing choropleth colors.
function createSimpleBasemap() {
    return L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
            attribution: "© OpenStreetMap contributors © CARTO",
            maxZoom: 19
        }
    );
}

function addStartingBasemap(satelliteLayer) {
    satelliteLayer.addTo(map);
}

// Adds a toggle control so users can switch between basemaps.
function addBasemapToggle(satelliteLayer, simpleLayer) {
    L.control.layers(
        { "🛰 Satellite": satelliteLayer, "🗺 Simple Map": simpleLayer },
        {}
    ).addTo(map);
}


/* ============================================================
   PART 3: CHOROPLETH CONTROLS AND COLORING
   ============================================================ */

// Adds a dropdown to the top-left of the map for picking the choropleth variable.
// We bind the change listener to "document" rather than the select directly
// because the select is added to the DOM after page load.
function addChoroplethDropdown() {

    var dropdownControl = L.control({ position: "topleft" });

    dropdownControl.onAdd = function () {
        var div = L.DomUtil.create("div", "choropleth-control");

        var optionsHTML = "";
        for (var fieldName in CHOROPLETH_LABELS) {
            optionsHTML += '<option value="' + fieldName + '">'
                         + CHOROPLETH_LABELS[fieldName] + '</option>';
        }

        div.innerHTML = '<label>Color map by:</label>'
                      + '<select id="choropleth-select">' + optionsHTML + '</select>';

        // Prevent dropdown clicks from also firing a map click event.
        L.DomEvent.disableClickPropagation(div);
        return div;
    };

    dropdownControl.addTo(map);

    $(document).on("change", "#choropleth-select", function () {
        currentChoroplethVariable = $(this).val();
        updateAllPolygonColors();
    });
}

// Returns a color interpolated between the variable's ramp based on the value (0–100).
function getColorForValue(value, variableName) {
    var colorScale = d3.scaleLinear()
        .domain([0, 100])
        .range(CHOROPLETH_COLORS[variableName]);
    return colorScale(value);
}

// Returns the full Leaflet style object for a polygon feature.
// Leaflet calls this automatically for each polygon when drawing the GeoJSON layer.
function getPolygonStyle(feature) {
    var value = feature.properties[currentChoroplethVariable] || 0;
    return {
        fillColor:   getColorForValue(value, currentChoroplethVariable),
        fillOpacity: NORMAL_FILL_OPACITY,
        color:       NORMAL_OUTLINE_COLOR,
        weight:      NORMAL_OUTLINE_WIDTH,
        opacity:     NORMAL_OUTLINE_OPACITY
    };
}

// Recolors all polygons when the user changes the dropdown.
// Skips the selected polygon so its highlight isn't overwritten.
function updateAllPolygonColors() {
    geojsonLayer.eachLayer(function (layer) {
        if (layer !== currentlySelectedLayer) {
            layer.setStyle(getPolygonStyle(layer.feature));
        }
    });
}


/* ============================================================
   PART 4: LOADING AND DISPLAYING THE GEOJSON
   ============================================================ */

// Creates the Leaflet GeoJSON layer and adds it to the map.
// fitBounds() automatically zooms to show all polygons.
function addGeoJSONToMap(geojsonData) {
    geojsonLayer = L.geoJSON(geojsonData, {
        style:         getPolygonStyle,
        onEachFeature: attachClickListener
    });
    geojsonLayer.addTo(map);
    map.fitBounds(geojsonLayer.getBounds());
    console.log("GeoJSON loaded and drawn on map.");
}

// Loads the GeoJSON file asynchronously using jQuery.
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
   PART 5: POLYGON SELECTION AND HIGHLIGHTING
   ============================================================ */

// Removes the highlight from the previously selected polygon.
function clearPreviousSelection() {
    if (currentlySelectedLayer !== null) {
        geojsonLayer.resetStyle(currentlySelectedLayer);
    }
}

// Applies the bold red-orange highlight style to the clicked polygon.
function highlightPolygon(layer) {
    layer.setStyle({
        color:       SELECTED_OUTLINE_COLOR,
        weight:      SELECTED_OUTLINE_WIDTH,
        opacity:     SELECTED_OUTLINE_OPACITY,
        fillOpacity: SELECTED_FILL_OPACITY
    });
}

// Main click handler - coordinates everything that happens when a polygon is clicked.
function handlePolygonClick(e) {
    var clickedLayer = e.target;

    clearPreviousSelection();
    highlightPolygon(clickedLayer);
    currentlySelectedLayer = clickedLayer;

    var props = clickedLayer.feature.properties;
    updateInfoPanel(props);
    drawETChart(props[GEOJSON_ID_FIELD]);
}

// Attaches a click listener to each polygon as the GeoJSON loads.
// Leaflet calls this once per feature via the onEachFeature option.
function attachClickListener(feature, layer) {
    layer.on({ click: handlePolygonClick });
}


/* ============================================================
   PART 6: INFO PANEL
   ============================================================ */

// Formats a decimal number as a percentage string, e.g. 6.7196 → "6.7%"
function formatAsPercent(value) {
    if (value === null || value === undefined) { return "--"; }
    return parseFloat(value).toFixed(1) + "%";
}

// Converts Shape_Area (square degrees, WGS84) to acres.
// Uses the meters-per-degree scale at our study latitude.
function convertSquareDegreesToAcres(shapeArea) {
    var latRad = STUDY_LATITUDE_DEGREES * (Math.PI / 180);
    var metersPerLatDeg = 110947;
    var metersPerLonDeg = Math.cos(latRad) * 111320;
    var sqMeters = shapeArea * metersPerLatDeg * metersPerLonDeg;
    return (sqMeters / 4046.86).toFixed(1);
}

// Resets the info panel to its default state before any polygon is selected.
function showDefaultInfoPanel() {
    $("#info-name").text("← Click a polygon on the map to see details");
    $("#info-tree").text("--");
    $("#info-shrub").text("--");
    $("#info-herb").text("--");
    $("#info-acres").text("--");
    $("#et-chart").html('<div class="et-placeholder">Select a polygon to view its ET trend</div>');
}

// Populates all info panel fields with the clicked polygon's attribute data.
function updateInfoPanel(properties) {
    $("#info-name").text(properties[POLYGON_NAME_FIELD] || "Unknown");
    $("#info-tree").text(formatAsPercent(properties.Tot_Tree_Cov));
    $("#info-shrub").text(formatAsPercent(properties.Tot_Shrub_Cov));
    $("#info-herb").text(formatAsPercent(properties.Tot_Herb_Cov));
    $("#info-acres").text(convertSquareDegreesToAcres(properties.Shape_Area) + " acres");
}


/* ============================================================
   PART 7: LOADING THE ET CSV DATA
   ============================================================ */

// Returns true if a value is a usable number (not "NA", null, or empty).
function isUsableNumber(value) {
    if (value === null || value === undefined) { return false; }
    if (value === "NA" || value === "")        { return false; }
    return !isNaN(parseFloat(value));
}

// Loads the ET CSV into the global etData array.
// D3 v5 uses Promises (.then / .catch) instead of the older callback style.
// d3.csv() reads all values as strings, so we convert numbers in the .then block.
function loadETData() {
    console.log("Loading ET data from:", ET_CSV_PATH);

    d3.csv(ET_CSV_PATH)
        .then(function (rows) {
            rows.forEach(function (row) {
                row.poly_id = +row.poly_id;
                row.year    = +row.year;
                row.mean = isUsableNumber(row.mean) ? +row.mean : null;
                row.p25  = isUsableNumber(row.p25)  ? +row.p25  : null;
                row.p75  = isUsableNumber(row.p75)  ? +row.p75  : null;
                row.npix = isUsableNumber(row.npix) ? +row.npix : null;
            });
            etData = rows;
            console.log("ET data loaded successfully:", etData.length, "rows");
        })
        .catch(function (error) {
            console.error("ERROR: Could not load ET data:", error);
        });
}


/* ============================================================
   PART 8: DRAWING THE ET CHART WITH D3

   The chart shows mean ET per year as a line with dots,
   and a shaded ribbon for the p25–p75 range.
   NA values (missing data) are skipped cleanly using .defined().
   ============================================================ */

// Returns all ET rows for a given polygon ID.
function getETRowsForPolygon(polygonID) {
    return etData.filter(function (row) { return row.poly_id === polygonID; });
}

// Returns only rows where mean is a real number (not null/NA).
function getValidETRows(allRows) {
    return allRows.filter(function (row) { return row.mean !== null; });
}

// Creates the SVG element and returns the inner chart group shifted by the margin.
function createChartSVG(totalWidth, totalHeight, margin) {
    var svg = d3.select("#et-chart")
        .append("svg")
        .attr("width",  totalWidth)
        .attr("height", totalHeight);

    return svg.append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
}

// Maps year values to horizontal pixel positions.
function createXScale(chartWidth) {
    return d3.scaleLinear()
        .domain([ET_YEAR_START, ET_YEAR_END])
        .range([0, chartWidth]);
}

// Maps ET values to vertical pixel positions.
// Range is flipped ([height, 0]) because SVG y-axis runs top-to-bottom.
function createYScale(validRows, chartHeight) {
    var maxVal = d3.max(validRows, function (d) { return d.p75 !== null ? d.p75 : d.mean; });
    return d3.scaleLinear()
        .domain([0, maxVal * 1.1])
        .range([chartHeight, 0]);
}

function drawXAxis(chartGroup, xScale, chartHeight) {
    chartGroup.append("g")
        .attr("class", "axis")
        .attr("transform", "translate(0," + chartHeight + ")")
        .call(d3.axisBottom(xScale)
            .tickFormat(d3.format("d"))
            .ticks(ET_YEAR_END - ET_YEAR_START));
}

function drawYAxis(chartGroup, yScale, margin, chartHeight) {
    chartGroup.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(yScale).ticks(5));

    // Rotated label along the left side
    chartGroup.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left + 15)
        .attr("x", -(chartHeight / 2))
        .attr("text-anchor", "middle")
        .style("font-size", "11px")
        .style("fill", "#555")
        .text(ET_Y_AXIS_LABEL);
}

// Draws the shaded ribbon between p25 and p75.
// .defined() leaves a gap where either value is null instead of connecting across it.
function drawRibbon(chartGroup, allRows, xScale, yScale) {
    var ribbon = d3.area()
        .defined(function (d) { return d.p25 !== null && d.p75 !== null; })
        .x(function  (d) { return xScale(d.year); })
        .y0(function (d) { return yScale(d.p25);  })
        .y1(function (d) { return yScale(d.p75);  });

    chartGroup.append("path")
        .datum(allRows)
        .attr("fill", "#b7e4c7")
        .attr("fill-opacity", 0.4)
        .attr("stroke", "none")
        .attr("d", ribbon);
}

// Draws the mean ET line. Gaps appear where mean is null (NA years).
function drawMeanLine(chartGroup, allRows, xScale, yScale) {
    var line = d3.line()
        .defined(function (d) { return d.mean !== null; })
        .x(function (d) { return xScale(d.year); })
        .y(function (d) { return yScale(d.mean); });

    chartGroup.append("path")
        .datum(allRows)
        .attr("fill", "none")
        .attr("stroke", "#40916c")
        .attr("stroke-width", 2)
        .attr("d", line);
}

// Draws one dot per valid year. Hovering shows a tooltip with year and value.
function drawDots(chartGroup, validRows, xScale, yScale) {
    chartGroup.selectAll("circle")
        .data(validRows)
        .enter()
        .append("circle")
        .attr("cx", function (d) { return xScale(d.year); })
        .attr("cy", function (d) { return yScale(d.mean); })
        .attr("r", 4)
        .attr("fill", "#1b4332")
        .attr("stroke", "white")
        .attr("stroke-width", 1.5)
        .append("title")
        .text(function (d) { return d.year + ": " + Math.round(d.mean) + " mm/yr"; });
}

// Main chart function - clears the previous chart and builds a new one for the given polygon.
function drawETChart(polygonID) {
    $("#et-chart").empty();

    var allRows   = getETRowsForPolygon(polygonID);
    var validRows = getValidETRows(allRows);

    if (allRows.length === 0) {
        $("#et-chart").html('<div class="et-placeholder">No ET data for this polygon</div>');
        return;
    }
    if (validRows.length === 0) {
        $("#et-chart").html('<div class="et-placeholder">All ET values are NA for this polygon</div>');
        return;
    }

    var margin      = { top: 15, right: 20, bottom: 40, left: 65 };
    var totalWidth  = document.getElementById("et-chart").offsetWidth || 400;
    var totalHeight = 185;
    var chartWidth  = totalWidth  - margin.left - margin.right;
    var chartHeight = totalHeight - margin.top  - margin.bottom;

    var chartGroup = createChartSVG(totalWidth, totalHeight, margin);
    var xScale     = createXScale(chartWidth);
    var yScale     = createYScale(validRows, chartHeight);

    drawXAxis(chartGroup, xScale, chartHeight);
    drawYAxis(chartGroup, yScale, margin, chartHeight);
    drawRibbon(chartGroup, allRows,   xScale, yScale);
    drawMeanLine(chartGroup, allRows, xScale, yScale);
    drawDots(chartGroup, validRows,   xScale, yScale);

    console.log("ET chart drawn for polygon", polygonID,
                "| valid years:", validRows.length,
                "| NA years:", allRows.length - validRows.length);
}


/* ============================================================
   PART 9: STARTUP

   $(document).ready() waits until the browser has finished
   building the HTML before running any of our code.
   ============================================================ */

$(document).ready(function () {

    console.log("Page loaded. Starting app setup...");

    // --- Phase 1: Build the map ---
    map = createLeafletMap();
    var satelliteLayer = createSatelliteBasemap();
    var simpleLayer    = createSimpleBasemap();
    addStartingBasemap(satelliteLayer);
    addBasemapToggle(satelliteLayer, simpleLayer);
    console.log("Map created.");

    // --- Phase 2: Add choropleth dropdown ---
    addChoroplethDropdown();
    console.log("Choropleth dropdown added.");

    // --- Phase 3: Set info panel default state ---
    showDefaultInfoPanel();

    // --- Phase 4: Load data ---
    loadETData();
    loadGeoJSONFile();

});
