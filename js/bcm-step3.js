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

var GEOJSON_PATH = "./data/NMRipMap_MRG_Subset.geojson";

var POLYGON_NAME_FIELD = "VegetationCommunityName";
var GEOJSON_ID_FIELD = "OBJECTID";

var MAP_START_LAT = 35.16514;
var MAP_START_LON = -106.66186;
var MAP_START_ZOOM = 14;

var STUDY_LATITUDE_DEGREES = 35.1;

// Uniform polygon style ------ Outline Only Layer symbology--These are for selected polys
var POLYGON_FILL_COLOR = "transparent";
var POLYGON_FILL_OPACITY = 0;
var POLYGON_OUTLINE_COLOR = "#ffffff";
var POLYGON_OUTLINE_WIDTH = 1.2;
var POLYGON_OUTLINE_OPACITY = 1;

////New Symbology for color coded community types:
// Filled vegetation layer (toggle on/off, bottom layer)
var FILL_LAYER_OPACITY = 0.55;
var FILL_LAYER_OUTLINE_COLOR = "transparent";
var FILL_LAYER_OUTLINE_WIDTH = 0;
var FILL_LAYER_OUTLINE_OPACITY = 0;

// -----------------------------------------------
// Style for the selected (clicked) polygon
var SELECTED_OUTLINE_COLOR = "#ff0000";
var SELECTED_OUTLINE_WIDTH = 4;
var SELECTED_OUTLINE_OPACITY = 1.0;
var SELECTED_FILL_OPACITY = 0.1;
// -------------------------------------------------------------

var map;
var vegetationFillLayer; // - New layer
var vegetationOutlineLayer; //This is my interactive layer that connects to chart and info panel 
var currentlySelectedLayer = null;

var layerControl;
var satelliteLayers;
var simpleLayer;
var vegetationLegend;

var vegetationColorMap = {};

// -- STEP 3 -- //

//$(document).ready(function () {

$.getScript("./js/mrw-charts.js", function () {
    //   console.log( data ); // Data returned
    //   console.log( textStatus ); // Success
    //   console.log( jqxhr.status ); // 200
    //   console.log( "Load was performed." );
});
//});

/* ============================================================
   PART 2: BUILDING THE MAP
   ============================================================ */

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

/* =================================================================
HELPER FUNCTIONS For Drawing and Displaying GEOJSONs
==================================================================*/

function getColorPalette() {
    return [
        "#1b9e77",
        "#d95f02",
        "#7570b3",
        "#e7298a",
        "#66a61e",
        "#e6ab02",
        "#a6761d",
        "#666666",
        "#1f78b4",
        "#b2df8a",
        "#fb9a99",
        "#fdbf6f",
        "#cab2d6",
        "#ffff99",
        "#6a3d9a",
        "#33a02c",
        "#ff7f00",
        "#a6cee3"
    ];
}

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

    uniqueNames.forEach(function (name, index) {
        vegetationColorMap[name] = palette[index % palette.length];
    });

    console.log("Vegetation color map built:", vegetationColorMap);
}

function getVegetationColor(name) {
    return vegetationColorMap[name] || "#cccccc";
}


/* ============================================================
   PART 3: LOADING AND DISPLAYING THE GEOJSON
   ============================================================ */

function getFillLayerStyle(feature) {
    var vegetationName = feature.properties[POLYGON_NAME_FIELD] || "Unknown";

    return {
        fillColor: getVegetationColor(vegetationName),
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

function addGeoJSONToMap(geojsonData) {
    buildVegetationColorMap(geojsonData);

    // Bottom filled layer
    vegetationFillLayer = L.geoJSON(geojsonData, {
        style: getFillLayerStyle,
        interactive: false
    });

    // Top outline-only clickable layer
    vegetationOutlineLayer = L.geoJSON(geojsonData, {
        style: getOutlineLayerStyle,
        onEachFeature: attachClickListener
    });

    vegetationFillLayer.addTo(map);
    vegetationOutlineLayer.addTo(map);

//    map.fitBounds(vegetationOutlineLayer.getBounds());

    console.log("GeoJSON loaded and both vegetation layers drawn.");

    addLayerControl();
    addVegetationLegend();
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
            "Color Coded Vegetation Communities": vegetationFillLayer
        }
    ).addTo(map);
}


///Add a legend for vegetationFillLayer

function addVegetationLegend() {
    if (vegetationLegend) {
        vegetationLegend.remove();
    }

    vegetationLegend = L.control({ position: "topleft" });

    vegetationLegend.onAdd = function () {
        var div = L.DomUtil.create("div", "legend legend-collapsed");
        var categories = Object.keys(vegetationColorMap).sort();

        var html = '';
        html += '<div class="legend-header">';
        html += '  <span class="legend-title">Vegetation Community</span>';
        html += '  <button type="button" class="legend-toggle-btn" id="legend-toggle-btn">Show</button>';
        html += '</div>';

        html += '<div class="legend-body" id="legend-body">';
        categories.forEach(function (category) {
            var color = vegetationColorMap[category];
            html +=
                '<div class="legend-item">' +
                    '<span class="legend-color" style="background:' + color + ';"></span>' +
                    '<span class="legend-label">' + category + '</span>' +
                '</div>';
        });
        html += '</div>';

        div.innerHTML = html;

        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        return div;
    };

    vegetationLegend.addTo(map);

    setTimeout(function () {
        var toggleBtn = document.getElementById("legend-toggle-btn");
        var legendBody = document.getElementById("legend-body");
        var legendBox = document.querySelector(".legend");

        if (toggleBtn && legendBody && legendBox) {
            toggleBtn.addEventListener("click", function () {
                var isCollapsed = legendBox.classList.contains("legend-collapsed");

                if (isCollapsed) {
                    legendBox.classList.remove("legend-collapsed");
                    legendBox.classList.add("legend-expanded");
                    toggleBtn.textContent = "Hide";
                } else {
                    legendBox.classList.remove("legend-expanded");
                    legendBox.classList.add("legend-collapsed");
                    toggleBtn.textContent = "Show";
                }
            });
        }
    }, 0);
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
        vegetationOutlineLayer.resetStyle(currentlySelectedLayer);
    }
}

function highlightPolygon(layer) {
    layer.setStyle({
        color: SELECTED_OUTLINE_COLOR,
        weight: SELECTED_OUTLINE_WIDTH,
        opacity: SELECTED_OUTLINE_OPACITY,
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

    // ET line chart

    var polygonID = +props[GEOJSON_ID_FIELD];
    var polygonData = ETDataByPolygon.get(polygonID);
    updateETChart(polygonData, props)
    
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
    $("#info-acres").text(properties.Area_ac != null
        ? Number(properties.Area_ac)
            .toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1
            }) + " acres"
        : "Unknown"
    );
}

function updateETChart(polygonData) {

    // first clause is what all empty data looks like to my knowledge
if (polygonData[0]["mean"] == 0 && isNaN(polygonData[1]["mean"]) || isNaN(polygonData[0]["mean"])&& isNaN(polygonData[1]["mean"]) ||
        !polygonData || polygonData.length === 0) {
        currentPolygon = null;
        $("#et-chart").html('<div class="et-placeholder">ET data is missing. Select a different polygon to view its ET trends. </div>'); 
        console.log("Data is missing", polygonData[0].PolyID);
        
    } else {
        drawETChart(polygonData);
    }       
}   

/* ============================================================
   PART 6: STARTUP
   ============================================================ */


$(document).ready(function () {
    console.log("Step 2: Polygon Selection + Info Panel");

    map = createLeafletMap();

    satelliteLayers = createSatelliteBasemap();
    simpleLayer = createSimpleBasemap();

    satelliteLayers.imagery.addTo(map);
    satelliteLayers.labels.addTo(map);

    showDefaultInfoPanel();
    loadGeoJSONFile();
});












/* -------------------------------------------------------------------------------------- */



// Track which variable is currently being displayed
var currentDisplayMode = "vegetation-community";

// Color functions for each cover type
function getTreeCoverColor(value) {
    if (value >= 75) {
        return "#00441b";
    } else if (value >= 50) {
        return "#1b7837";
    } else if (value >= 25) {
        return "#5aae61";
    } else if (value >= 10) {
        return "#a6dba0";
    } else if (value > 0) {
        return "#d9f0d3";
    } else {
        return "#f7fcf5";
    }
}

function getShrubCoverColor(value) {
    if (value >= 75) {
        return "#7f2704";
    } else if (value >= 50) {
        return "#a63603";
    } else if (value >= 25) {
        return "#d94801";
    } else if (value >= 10) {
        return "#f16913";
    } else if (value > 0) {
        return "#fdae6b";
    } else {
        return "#fff5eb";
    }
}

function getHerbCoverColor(value) {
    if (value >= 75) {
        return "#4d2c19";
    } else if (value >= 50) {
        return "#7f4f24";
    } else if (value >= 25) {
        return "#936639";
    } else if (value >= 10) {
        return "#b08968";
    } else if (value > 0) {
        return "#ddb892";
    } else {
        return "#f5ebe0";
    }
}

// Decide which color to use for each polygon
function getCurrentDisplayFillColor(feature) {

    // Use original vegetation community colors
    if (currentDisplayMode === "vegetation-community") {
        var vegetationName = feature.properties[POLYGON_NAME_FIELD] || "Unknown";
        return getVegetationColor(vegetationName);
    }

    // Get numeric value for selected field
    var value = feature.properties[currentDisplayMode];

    if (value === null || value === undefined || isNaN(value)) {
        value = 0;
    }

    value = Number(value);

    // Choose palette based on selected variable
    if (currentDisplayMode === "Tot_Tree_Cov") {
        return getTreeCoverColor(value);
    }

    if (currentDisplayMode === "Tot_Shrub_Cov") {
        return getShrubCoverColor(value);
    }

    if (currentDisplayMode === "Tot_Herb_Cov") {
        return getHerbCoverColor(value);
    }

    return "#cccccc";
}

// Update all polygon colors on the map
function updateFillLayerForCurrentDisplayMode() {

    if (!vegetationFillLayer) {
        return;
    }

    vegetationFillLayer.eachLayer(function (layer) {
        layer.setStyle({
            fillColor: getCurrentDisplayFillColor(layer.feature),
            fillOpacity: FILL_LAYER_OPACITY,
            color: FILL_LAYER_OUTLINE_COLOR,
            weight: FILL_LAYER_OUTLINE_WIDTH,
            opacity: FILL_LAYER_OUTLINE_OPACITY
        });
    });

    // Rebuild legend after colors change
    addLegendForCurrentDisplayMode();
}

// Build legend content depending on selected variable
function buildLegendBodyHtmlForCurrentMode() {

    var html = '';

    // Vegetation community legend (original)
    if (currentDisplayMode === "vegetation-community") {
        var categories = Object.keys(vegetationColorMap).sort();

        categories.forEach(function (category) {
            var color = vegetationColorMap[category];

            html +=
                '<div class="legend-item">' +
                    '<span class="legend-color" style="background:' + color + ';"></span>' +
                    '<span class="legend-label">' + category + '</span>' +
                '</div>';
        });

        return html;
    }

    // Tree cover legend
    if (currentDisplayMode === "Tot_Tree_Cov") {
        html += '<div class="legend-item"><span class="legend-color" style="background:#f7fcf5;"></span><span class="legend-label">0%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#d9f0d3;"></span><span class="legend-label">0.1% to 9.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#a6dba0;"></span><span class="legend-label">10% to 24.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#5aae61;"></span><span class="legend-label">25% to 49.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#1b7837;"></span><span class="legend-label">50% to 74.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#00441b;"></span><span class="legend-label">75% and above</span></div>';
        return html;
    }

    // Shrub cover legend
    if (currentDisplayMode === "Tot_Shrub_Cov") {
        html += '<div class="legend-item"><span class="legend-color" style="background:#fff5eb;"></span><span class="legend-label">0%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#fdae6b;"></span><span class="legend-label">0.1% to 9.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#f16913;"></span><span class="legend-label">10% to 24.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#d94801;"></span><span class="legend-label">25% to 49.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#a63603;"></span><span class="legend-label">50% to 74.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#7f2704;"></span><span class="legend-label">75% and above</span></div>';
        return html;
    }

    // Herbaceous cover legend
    if (currentDisplayMode === "Tot_Herb_Cov") {
        html += '<div class="legend-item"><span class="legend-color" style="background:#f5ebe0;"></span><span class="legend-label">0%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#ddb892;"></span><span class="legend-label">0.1% to 9.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#b08968;"></span><span class="legend-label">10% to 24.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#936639;"></span><span class="legend-label">25% to 49.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#7f4f24;"></span><span class="legend-label">50% to 74.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#4d2c19;"></span><span class="legend-label">75% and above</span></div>';
        return html;
    }

    return html;
}

// Create legend with dropdown and dynamic content
function addLegendForCurrentDisplayMode() {

    if (vegetationLegend) {
        vegetationLegend.remove();
    }

    vegetationLegend = L.control({ position: "topleft" });

    vegetationLegend.onAdd = function () {

        var div = L.DomUtil.create("div", "legend legend-collapsed");

        var html = '';

        html += '<div class="legend-header">';
        html += '  <span class="legend-title">Map Display</span>';
        html += '  <button type="button" class="legend-toggle-btn" id="legend-toggle-btn">Show</button>';
        html += '</div>';

        // Dropdown selector
        html += '<div style="margin-top:8px;">';
        html += '  <label for="legend-mode-select" style="display:block; font-weight:bold; margin-bottom:6px;">Display Variable</label>';
        html += '  <select id="legend-mode-select" style="width:100%; padding:6px 8px; font-size:13px;">';
        html += '      <option value="vegetation-community"' + (currentDisplayMode === "vegetation-community" ? ' selected' : '') + '>Vegetation Community</option>';
        html += '      <option value="Tot_Tree_Cov"' + (currentDisplayMode === "Tot_Tree_Cov" ? ' selected' : '') + '>Tree Cover</option>';
        html += '      <option value="Tot_Shrub_Cov"' + (currentDisplayMode === "Tot_Shrub_Cov" ? ' selected' : '') + '>Shrub Cover</option>';
        html += '      <option value="Tot_Herb_Cov"' + (currentDisplayMode === "Tot_Herb_Cov" ? ' selected' : '') + '>Herbaceous Cover</option>';
        html += '  </select>';
        html += '</div>';

        // Legend items
        html += '<div class="legend-body" id="legend-body">';
        html += buildLegendBodyHtmlForCurrentMode();
        html += '</div>';

        div.innerHTML = html;

        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        return div;
    };

    vegetationLegend.addTo(map);

    // Attach events after legend is added to DOM
    setTimeout(function () {

        var toggleBtn = document.getElementById("legend-toggle-btn");
        var legendBody = document.getElementById("legend-body");
        var legendBox = document.querySelector(".legend");
        var modeSelect = document.getElementById("legend-mode-select");

        // Show / hide legend
        if (toggleBtn && legendBody && legendBox) {
            toggleBtn.addEventListener("click", function () {

                var isCollapsed = legendBox.classList.contains("legend-collapsed");

                if (isCollapsed) {
                    legendBox.classList.remove("legend-collapsed");
                    legendBox.classList.add("legend-expanded");
                    toggleBtn.textContent = "Hide";
                } else {
                    legendBox.classList.remove("legend-expanded");
                    legendBox.classList.add("legend-collapsed");
                    toggleBtn.textContent = "Show";
                }
            });
        }

        // Dropdown change updates map + legend
        if (modeSelect) {
            modeSelect.addEventListener("change", function () {
                currentDisplayMode = this.value;
                updateFillLayerForCurrentDisplayMode();
            });
        }

    }, 0);
}

// Initialize new legend after map loads
$(document).ready(function () {
    setTimeout(function () {
        addLegendForCurrentDisplayMode();
    }, 100);
});
