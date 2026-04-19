/* bcm-step2-updated.js

   Features:
   - Leaflet map with basemaps
   - Choropleth based on dropdown selection
   - Click polygons to update info panel
   - ET chart updates on click
   - Simple legend that updates with dropdown
*/


// --------------------- SETTINGS ---------------------

var GEOJSON_PATH = "./data/NMRipMap_MRG_Subset.geojson";

var POLYGON_NAME_FIELD = "VegetationCommunityName";
var GEOJSON_ID_FIELD = "OBJECTID";

var MAP_START_LAT = 35.16514;
var MAP_START_LON = -106.66186;
var MAP_START_ZOOM = 16;

// outline layer (clickable)
var POLYGON_FILL_COLOR = "transparent";
var POLYGON_FILL_OPACITY = 0;
var POLYGON_OUTLINE_COLOR = "#ffffff";
var POLYGON_OUTLINE_WIDTH = 1.2;
var POLYGON_OUTLINE_OPACITY = 1;

// fill layer (choropleth)
var FILL_LAYER_OPACITY = 0.55;
var FILL_LAYER_OUTLINE_COLOR = "transparent";
var FILL_LAYER_OUTLINE_WIDTH = 0;
var FILL_LAYER_OUTLINE_OPACITY = 0;

// selected polygon
var SELECTED_OUTLINE_COLOR = "#ff0000";
var SELECTED_OUTLINE_WIDTH = 4;
var SELECTED_OUTLINE_OPACITY = 1.0;
var SELECTED_FILL_OPACITY = 0.1;

// dropdown state
var currentChoroplethField = "Tot_Tree_Cov";

var choroplethDisplayNames = {
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


// --------------------- MAP SETUP ---------------------

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
            "Reference Labels": satelliteLayers.labels,
            "Choropleth Layer": vegetationFillLayer
        }
    ).addTo(map);
}


// --------------------- CHOROPLETH ---------------------

function getChoroplethValue(feature) {
    var value = feature.properties[currentChoroplethField];

    if (value === null || value === undefined || isNaN(value)) {
        return 0;
    }

    return Number(value);
}

function getChoroplethColor(value) {
    if (value >= 75) return "#084081";
    if (value >= 50) return "#0868ac";
    if (value >= 25) return "#2b8cbe";
    if (value >= 10) return "#4eb3d3";
    if (value > 0) return "#7bccc4";
    return "#f7fcf0";
}

function getFillLayerStyle(feature) {
    var value = getChoroplethValue(feature);

    return {
        fillColor: getChoroplethColor(value),
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
    if (!vegetationFillLayer) return;

    vegetationFillLayer.eachLayer(function (layer) {
        layer.setStyle(getFillLayerStyle(layer.feature));
    });

    addVegetationLegend();
}


// --------------------- GEOJSON ---------------------

function addGeoJSONToMap(geojsonData) {
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


// --------------------- LEGEND ---------------------

function addVegetationLegend() {
    if (vegetationLegend) {
        vegetationLegend.remove();
    }

    vegetationLegend = L.control({ position: "topleft" });

    vegetationLegend.onAdd = function () {
        var div = L.DomUtil.create("div", "legend");
        var html = "";

        html += "<div class='legend-header'>";
        html += "<span class='legend-title'>" + choroplethDisplayNames[currentChoroplethField] + "</span>";
        html += "</div>";

        html += "<div class='legend-body' style='display:block; margin-top:8px;'>";

        html += "<div class='legend-item'><span class='legend-color' style='background:#f7fcf0;'></span>0%</div>";
        html += "<div class='legend-item'><span class='legend-color' style='background:#7bccc4;'></span>0.1 to 9.9%</div>";
        html += "<div class='legend-item'><span class='legend-color' style='background:#4eb3d3;'></span>10 to 24.9%</div>";
        html += "<div class='legend-item'><span class='legend-color' style='background:#2b8cbe;'></span>25 to 49.9%</div>";
        html += "<div class='legend-item'><span class='legend-color' style='background:#0868ac;'></span>50 to 74.9%</div>";
        html += "<div class='legend-item'><span class='legend-color' style='background:#084081;'></span>75%+</div>";

        html += "</div>";

        div.innerHTML = html;

        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        return div;
    };

    vegetationLegend.addTo(map);
}


// --------------------- POLYGON CLICK ---------------------

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


// --------------------- INFO PANEL ---------------------

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


// --------------------- ET CHART ---------------------

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


// --------------------- DROPDOWN ---------------------

function setupChoroplethSelector() {
    $("#choropleth-select").on("change", function () {
        currentChoroplethField = $(this).val();
        updateChoroplethStyle();
    });
}


// --------------------- STARTUP ---------------------

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
