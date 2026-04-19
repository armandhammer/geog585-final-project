/* bcm-step2-updated.js

   Features:
   - Leaflet map with basemaps
   - Filled polygon layer
   - Clickable outline layer
   - Info panel updates on click
   - ET chart updates on click
   - Dropdown lets user choose:
       Vegetation Community
       Tree Cover
       Shrub Cover
       Herbaceous Cover
   - Legend updates to match the current map mode
*/


// SETTINGS

var GEOJSON_PATH = "./data/NMRipMap_MRG_Subset.geojson";

var POLYGON_NAME_FIELD = "VegetationCommunityName";
var GEOJSON_ID_FIELD = "OBJECTID";

var MAP_START_LAT = 35.16514;
var MAP_START_LON = -106.66186;
var MAP_START_ZOOM = 16;

// outline layer
var POLYGON_FILL_COLOR = "transparent";
var POLYGON_FILL_OPACITY = 0;
var POLYGON_OUTLINE_COLOR = "#ffffff";
var POLYGON_OUTLINE_WIDTH = 1.2;
var POLYGON_OUTLINE_OPACITY = 1;

// fill layer
var FILL_LAYER_OPACITY = 0.55;
var FILL_LAYER_OUTLINE_COLOR = "transparent";
var FILL_LAYER_OUTLINE_WIDTH = 0;
var FILL_LAYER_OUTLINE_OPACITY = 0;

// selected polygon
var SELECTED_OUTLINE_COLOR = "#ff0000";
var SELECTED_OUTLINE_WIDTH = 4;
var SELECTED_OUTLINE_OPACITY = 1.0;
var SELECTED_FILL_OPACITY = 0.1;

// current dropdown mode
var currentChoroplethField = "VegetationCommunityName";

// display names used in legend and dropdown logic
var choroplethDisplayNames = {
    VegetationCommunityName: "Vegetation Community",
    Tot_Tree_Cov: "Tree Cover",
    Tot_Shrub_Cov: "Shrub Cover",
    Tot_Herb_Cov: "Herbaceous Cover"
};

// globals
var map;
var vegetationFillLayer;
var vegetationOutlineLayer;
var currentlySelectedLayer = null;

var layerControl;
var satelliteLayers;
var simpleLayer;
var vegetationLegend;

// stores colors for vegetation community categories
var vegetationColorMap = {};


// MAP SETUP

function createLeafletMap() {
    return L.map("map").setView([MAP_START_LAT, MAP_START_LON], MAP_START_ZOOM);
}

function createSatelliteBasemap() {
    var imagery = L.tileLayer(
        "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
        { attribution: "USGS", maxZoom: 19 }
    );

    var labels = L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Labels © Esri", maxZoom: 19 }
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


// VEGETATION COMMUNITY COLOR HELPERS

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
}

function getVegetationColor(name) {
    return vegetationColorMap[name] || "#cccccc";
}


// CHOROPLETH HELPERS

function getNumericChoroplethValue(feature) {
    var value = feature.properties[currentChoroplethField];

    if (value === null || value === undefined || isNaN(value)) {
        return 0;
    }

    return Number(value);
}

function getNumericChoroplethColor(value) {
    if (value >= 75) return "#084081";
    if (value >= 50) return "#0868ac";
    if (value >= 25) return "#2b8cbe";
    if (value >= 10) return "#4eb3d3";
    if (value > 0) return "#7bccc4";
    return "#f7fcf0";
}

function getFillColor(feature) {
    if (currentChoroplethField === "VegetationCommunityName") {
        var vegetationName = feature.properties[POLYGON_NAME_FIELD] || "Unknown";
        return getVegetationColor(vegetationName);
    } else {
        var value = getNumericChoroplethValue(feature);
        return getNumericChoroplethColor(value);
    }
}

function getFillLayerStyle(feature) {
    return {
        fillColor: getFillColor(feature),
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

function updateChoroplethStyle() {
    if (!vegetationFillLayer) {
        return;
    }

    vegetationFillLayer.eachLayer(function (layer) {
        layer.setStyle(getFillLayerStyle(layer.feature));
    });

    addVegetationLegend();
}


// GEOJSON

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

function loadGeoJSONFile() {
    $.getJSON(GEOJSON_PATH, function (data) {
        addGeoJSONToMap(data);
    }).fail(function () {
        alert("Could not load map data.");
    });
}


// LEGEND

function addVegetationLegend() {
    if (vegetationLegend) {
        vegetationLegend.remove();
    }

    vegetationLegend = L.control({ position: "topleft" });

    vegetationLegend.onAdd = function () {
        var div = L.DomUtil.create("div", "legend legend-collapsed");
        var html = "";

        html += '<div class="legend-header">';
        html += '<span class="legend-title">' + choroplethDisplayNames[currentChoroplethField] + '</span>';
        html += '<button type="button" class="legend-toggle-btn" id="legend-toggle-btn">Show</button>';
        html += '</div>';

        html += '<div class="legend-body" id="legend-body">';

        if (currentChoroplethField === "VegetationCommunityName") {
            var categories = Object.keys(vegetationColorMap).sort();

            categories.forEach(function (category) {
                var color = vegetationColorMap[category];

                html +=
                    '<div class="legend-item">' +
                        '<span class="legend-color" style="background:' + color + ';"></span>' +
                        '<span class="legend-label">' + category + '</span>' +
                    '</div>';
            });
        } else {
            html += '<div class="legend-item"><span class="legend-color" style="background:#f7fcf0;"></span><span class="legend-label">0%</span></div>';
            html += '<div class="legend-item"><span class="legend-color" style="background:#7bccc4;"></span><span class="legend-label">0.1 to 9.9%</span></div>';
            html += '<div class="legend-item"><span class="legend-color" style="background:#4eb3d3;"></span><span class="legend-label">10 to 24.9%</span></div>';
            html += '<div class="legend-item"><span class="legend-color" style="background:#2b8cbe;"></span><span class="legend-label">25 to 49.9%</span></div>';
            html += '<div class="legend-item"><span class="legend-color" style="background:#0868ac;"></span><span class="legend-label">50 to 74.9%</span></div>';
            html += '<div class="legend-item"><span class="legend-color" style="background:#084081;"></span><span class="legend-label">75%+</span></div>';
        }

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


// POLYGON CLICK

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
    updateETChart(polygonData);
}

function attachClickListener(feature, layer) {
    layer.on({ click: handlePolygonClick });
}


// INFO PANEL

function formatAsPercent(value) {
    if (value === null || value === undefined || isNaN(value)) {
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

    if (properties.Area_ac != null) {
        $("#info-acres").text(
            Number(properties.Area_ac).toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1
            }) + " acres"
        );
    } else {
        $("#info-acres").text("Unknown");
    }
}


// ET CHART

function updateETChart(polygonData) {
    if (!polygonData || polygonData.length === 0) {
        $("#et-chart").html('<div class="et-placeholder">ET data is missing.</div>');
        return;
    }

    if (
        polygonData.length > 1 &&
        (
            (polygonData[0].mean == 0 && isNaN(polygonData[1].mean)) ||
            (isNaN(polygonData[0].mean) && isNaN(polygonData[1].mean))
        )
    ) {
        $("#et-chart").html('<div class="et-placeholder">ET data is missing.</div>');
        return;
    }

    drawETChart(polygonData);
}


// DROPDOWN

function setupChoroplethSelector() {
    $("#choropleth-select").on("change", function () {
        currentChoroplethField = $(this).val();
        updateChoroplethStyle();
    });
}


// STARTUP

$(document).ready(function () {
    map = createLeafletMap();

    satelliteLayers = createSatelliteBasemap();
    simpleLayer = createSimpleBasemap();

    satelliteLayers.imagery.addTo(map);
    satelliteLayers.labels.addTo(map);

    showDefaultInfoPanel();
    setupChoroplethSelector();
    loadGeoJSONFile();
});
