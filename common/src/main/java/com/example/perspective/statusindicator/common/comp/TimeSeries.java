package com.example.perspective.statusindicator.common.comp;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.example.perspective.statusindicator.common.StatusIndicatorModule;

/**
 * TimeSeries Panel component descriptor.
 * Grafana-style time-series line chart with tooltip, zoom, pan, legend.
 */
public class TimeSeries {

    public static final String COMPONENT_ID = "com.example.perspective.timeseries";

    public static final JsonSchema SCHEMA =
        JsonSchema.parse(
            StatusIndicatorModule.class.getResourceAsStream("/timeseries.props.json")
        );

    public static final ComponentDescriptor DESCRIPTOR =
        ComponentDescriptorImpl.ComponentBuilder.newBuilder()
            .setPaletteCategory(StatusIndicatorModule.COMPONENT_CATEGORY)
            .setId(COMPONENT_ID)
            .setModuleId(StatusIndicatorModule.MODULE_ID)
            .setSchema(SCHEMA)
            .setName("TimeSeries Panel")
            .addPaletteEntry("", "TimeSeries Panel",
                "Grafana-style time-series chart with tooltip, zoom/pan, crosshair and legend toggle.",
                null, null)
            .setDefaultMetaName("timeSeriesPanel")
            .setResources(StatusIndicatorModule.BROWSER_RESOURCES)
            .build();
}
