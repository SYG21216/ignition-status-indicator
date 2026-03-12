package com.example.perspective.statusindicator.common.comp;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.example.perspective.statusindicator.common.StatusIndicatorModule;

/**
 * Bar Chart component descriptor.
 * Displays categorical data as horizontal or vertical bars.
 */
public class BarChart {

    public static final String COMPONENT_ID = "com.example.perspective.barchart";

    public static final JsonSchema SCHEMA =
        JsonSchema.parse(
            StatusIndicatorModule.class.getResourceAsStream("/barchart.props.json")
        );

    public static final ComponentDescriptor DESCRIPTOR =
        ComponentDescriptorImpl.ComponentBuilder.newBuilder()
            .setPaletteCategory(StatusIndicatorModule.COMPONENT_CATEGORY)
            .setId(COMPONENT_ID)
            .setModuleId(StatusIndicatorModule.MODULE_ID)
            .setSchema(SCHEMA)
            .setName("Bar Chart")
            .addPaletteEntry("", "Bar Chart", "A vertical or horizontal bar chart.", null, null)
            .setDefaultMetaName("barChart")
            .setResources(StatusIndicatorModule.BROWSER_RESOURCES)
            .build();
}
