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
var MAP_START_ZOOM = 16;

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

var zoomToDataControl;

// Legend was resetting open/closed state when switching display variables.
// Used ChatGPT to store the state instead of relying on legend rebuilds.
var isLegendExpanded = false;

var vegetationColorMap = {};


/* MAP SETUP */

/* Reference: Leaflet Quick Start Guide
   https://leafletjs.com/examples/quick-start/
   Reference for basic Leaflet map setup pattern. */

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

/* Reference: Leaflet "Layer Groups and Layers Control"
   https://leafletjs.com/examples/layers-control/
   Used for the base layer / overlay control pattern with L.control.layers. */

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


/* Reference: Leaflet "Extending Leaflet, New Handlers and Controls"
   https://leafletjs.com/examples/extending/extending-3-controls.html
   Used idea for the custom control pattern with onAdd(). */

function addZoomToDataControl() {
    if (zoomToDataControl) {
        zoomToDataControl.remove();
    }

    zoomToDataControl = L.control({ position: "topleft" });

    zoomToDataControl.onAdd = function () {
        var div = L.DomUtil.create("div", "leaflet-bar leaflet-control");
        div.innerHTML = '<button type="button" class="zoom-data-btn">Zoom to Data Extent</button>';

        var button = div.querySelector(".zoom-data-btn");

        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        if (button) {
            button.addEventListener("click", function () {
                if (vegetationFillLayer) {
                    map.fitBounds(vegetationFillLayer.getBounds(), {
                        padding: [20, 20]
                    });
                }
            });
        }

        return div;
    };

    zoomToDataControl.addTo(map);
}

/* COLOR HELPERS */

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

/* Reference: Leaflet "Interactive Choropleth Map"
   https://leafletjs.com/examples/choropleth/
   Used for a reference for GeoJSON styling, choropleth coloring, and legend ideas. */

// This worked before, but this version simplifies how unique categories map to colors.
// Used ChatGPT to simplify category-to-color mapping into a lookup table.

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

    // Keeps color assignment simple even if categories exceed palette size.
    uniqueNames.forEach(function (name, index) {
        vegetationColorMap[name] = palette[index % palette.length];
    });
}

function getVegetationColor(name) {
    return vegetationColorMap[name] || "#cccccc";
}

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

// This logic originally worked but was spread out in multiple places.
// Used ChatGPT to consolidate display mode color logic into a single function.

function getCurrentFillColor(feature) {
    if (currentDisplayMode === "vegetation-community") {
        var vegetationName = feature.properties[POLYGON_NAME_FIELD] || "Unknown";
        return getVegetationColor(vegetationName);
    }

    var value = feature.properties[currentDisplayMode];

    // Some features had missing values causing inconsistent styling.
    // Used ChatGPT to standardize fallback handling.
    if (value === null || value === undefined || isNaN(value)) {
        value = 0;
    }

    // Values were occasionally treated as strings.
    // Used ChatGPT to ensure numeric conversion.
    value = Number(value);

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

// Data loading already worked, but this keeps styling separate from loading.
// Used ChatGPT to make display switching cleaner without reloading data.
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

    addZoomToDataControl();
    addLayerControl();
    addVegetationLegend();
}

/* Reference: jQuery getJSON() Method
   https://www.w3schools.com/jquery/ajax_getjson.asp
   Used here for the basic pattern to load GeoJSON with $.getJSON(...). */

function loadGeoJSONFile() {
    $.getJSON(GEOJSON_PATH, function (data) {
        addGeoJSONToMap(data);
    }).fail(function () {
        alert("Could not load map data. Check the file path: " + GEOJSON_PATH);
    });
}


/* LEGEND */

function buildLegendItemsHtml() {
    var html = '';

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

    if (currentDisplayMode === "Tot_Tree_Cov") {
        html += '<div class="legend-item"><span class="legend-color" style="background:#f7fcf5;"></span><span class="legend-label">0%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#d9f0d3;"></span><span class="legend-label">0.1% to 9.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#a6dba0;"></span><span class="legend-label">10% to 24.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#5aae61;"></span><span class="legend-label">25% to 49.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#1b7837;"></span><span class="legend-label">50% to 74.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#00441b;"></span><span class="legend-label">75% and above</span></div>';
        return html;
    }

    if (currentDisplayMode === "Tot_Shrub_Cov") {
        html += '<div class="legend-item"><span class="legend-color" style="background:#fff5eb;"></span><span class="legend-label">0%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#fdae6b;"></span><span class="legend-label">0.1% to 9.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#f16913;"></span><span class="legend-label">10% to 24.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#d94801;"></span><span class="legend-label">25% to 49.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#a63603;"></span><span class="legend-label">50% to 74.9%</span></div>';
        html += '<div class="legend-item"><span class="legend-color" style="background:#7f2704;"></span><span class="legend-label">75% and above</span></div>';
        return html;
    }

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

/* Reference: Leaflet Control / Custom Control pattern
   https://leafletjs.com/examples/extending/extending-3-controls.html
   Reference for building a custom legend control with dynamic content. */

function addVegetationLegend() {
    if (vegetationLegend) {
        vegetationLegend.remove();
    }

    vegetationLegend = L.control({ position: "topleft" });

    vegetationLegend.onAdd = function () {
        var legendClass = isLegendExpanded ? "legend legend-expanded" : "legend legend-collapsed";
        var buttonText = isLegendExpanded ? "Hide Legend" : "Show Legend";

        var div = L.DomUtil.create("div", legendClass);
        var html = '';

        html += '<div class="legend-header">';
        html += '  <span class="legend-title">Map Display</span>';
        html += '  <button type="button" class="legend-toggle-btn" id="legend-toggle-btn">' + buttonText + '</button>';
        html += '</div>';

        html += '<div style="margin-top:8px;">';
        html += '  <label for="legend-mode-select" style="display:block; font-weight:bold; margin-bottom:6px;">Display Variable</label>';
        html += '  <select id="legend-mode-select" style="width:100%; padding:6px 8px; font-size:13px;">';
        html += '      <option value="vegetation-community"' + (currentDisplayMode === "vegetation-community" ? ' selected' : '') + '>Vegetation Community</option>';
        html += '      <option value="Tot_Tree_Cov"' + (currentDisplayMode === "Tot_Tree_Cov" ? ' selected' : '') + '>Tree Cover</option>';
        html += '      <option value="Tot_Shrub_Cov"' + (currentDisplayMode === "Tot_Shrub_Cov" ? ' selected' : '') + '>Shrub Cover</option>';
        html += '      <option value="Tot_Herb_Cov"' + (currentDisplayMode === "Tot_Herb_Cov" ? ' selected' : '') + '>Herbaceous Cover</option>';
        html += '  </select>';
        html += '</div>';

        html += '<div class="legend-body" id="legend-body">';
        html += buildLegendItemsHtml();
        html += '</div>';

        div.innerHTML = html;

        var toggleBtn = div.querySelector("#legend-toggle-btn");
        var modeSelect = div.querySelector("#legend-mode-select");

        if (toggleBtn) {
            // Toggle worked before, but was tied to less precise element selection.
            // Used ChatGPT to bind directly to this legend instance.
            toggleBtn.addEventListener("click", function () {
                if (isLegendExpanded) {
                    isLegendExpanded = false;
                    div.classList.remove("legend-expanded");
                    div.classList.add("legend-collapsed");
                    toggleBtn.textContent = "Show Legend";
                } else {
                    isLegendExpanded = true;
                    div.classList.remove("legend-collapsed");
                    div.classList.add("legend-expanded");
                    toggleBtn.textContent = "Hide Legend";
                }
            });
        }

        if (modeSelect) {
            modeSelect.addEventListener("change", function () {
                currentDisplayMode = this.value;
                updateFillLayerColors();
            });
        }

        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        return div;
    };

    vegetationLegend.addTo(map);
}

// Originally rebuilt the entire legend on each dropdown change.
// Used ChatGPT to update only the legend contents instead.
function updateFillLayerColors() {
    if (!vegetationFillLayer) {
        return;
    }

    // Recolor existing features instead of reloading the GeoJSON.
    vegetationFillLayer.eachLayer(function (layer) {
        layer.setStyle(getFillLayerStyle(layer.feature));
    });

    var legendBody = document.getElementById("legend-body");

    if (legendBody) {
        legendBody.innerHTML = buildLegendItemsHtml();
    }
}


/* POLYGON CLICK */

// Selection worked, but could leave multiple polygons highlighted.
// Used ChatGPT to simplify clearing the previous selection.
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

    var polygonID = +props[GEOJSON_ID_FIELD];
    var polygonData = ETDataByPolygon.get(polygonID);
    updateETChart(polygonData, props);
}

// Click handling was functional but slightly messy before.
// Used ChatGPT to keep interaction isolated to the outline layer.
function attachClickListener(feature, layer) {
    layer.on({ click: handlePolygonClick });
}


/* INFO PANEL */

function formatAsPercent(value) {
    if (value === null || value === undefined) {
        return "--";
    }

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
    $("#info-acres").text(
        properties.Area_ac != null
            ? Number(properties.Area_ac).toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1
            }) + " acres"
            : "Unknown"
    );
}


/* ET CHART */

/* Reference: D3 Getting Started (Line Chart Pattern)
   https://d3js.org/getting-started
   Reference for basic line chart structure (scales, axes, line generator). */

function updateETChart(polygonData) {
    if (
        !polygonData ||
        polygonData.length === 0 ||
        (polygonData[0]["mean"] == 0 && polygonData[1] && isNaN(polygonData[1]["mean"])) ||
        (isNaN(polygonData[0]["mean"]) && polygonData[1] && isNaN(polygonData[1]["mean"]))
    ) {
        $("#et-chart").html('<div class="et-placeholder">ET data is missing. Select a different polygon to view its ET trends.</div>');
    } else {
        drawETChart(polygonData);
    }
}


/* STARTUP */

$(document).ready(function () {
    map = createLeafletMap();

    satelliteLayers = createSatelliteBasemap();
    simpleLayer = createSimpleBasemap();

    satelliteLayers.imagery.addTo(map);
    satelliteLayers.labels.addTo(map);

    showDefaultInfoPanel();
    loadGeoJSONFile();
});
