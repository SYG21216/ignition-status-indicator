package com.example.perspective.statusindicator.common.comp;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.example.perspective.statusindicator.common.StatusIndicatorModule;

/**
 * Line Chart component descriptor.
 * Displays one or more data series as lines over time or categories.
 */
public class LineChart {

    public static final String COMPONENT_ID = "com.example.perspective.linechart";

    public static final JsonSchema SCHEMA =
        JsonSchema.parse(
            StatusIndicatorModule.class.getResourceAsStream("/linechart.props.json")
        );

    public static final ComponentDescriptor DESCRIPTOR =
        ComponentDescriptorImpl.ComponentBuilder.newBuilder()
            .setPaletteCategory(StatusIndicatorModule.COMPONENT_CATEGORY)
            .setId(COMPONENT_ID)
            .setModuleId(StatusIndicatorModule.MODULE_ID)
            .setSchema(SCHEMA)
            .setName("Line Chart")
            .addPaletteEntry("", "Line Chart", "A multi-series line chart for trend visualization.", null, null)
            .setDefaultMetaName("lineChart")
            .setResources(StatusIndicatorModule.BROWSER_RESOURCES)
            .build();
}
