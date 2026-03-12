package com.example.perspective.statusindicator.common.comp;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.example.perspective.statusindicator.common.StatusIndicatorModule;

/**
 * Circular Gauge component descriptor.
 * Displays a value on an arc-style gauge with min/max/thresholds.
 */
public class Gauge {

    public static final String COMPONENT_ID = "com.example.perspective.gauge";

    public static final JsonSchema SCHEMA =
        JsonSchema.parse(
            StatusIndicatorModule.class.getResourceAsStream("/gauge.props.json")
        );

    public static final ComponentDescriptor DESCRIPTOR =
        ComponentDescriptorImpl.ComponentBuilder.newBuilder()
            .setPaletteCategory(StatusIndicatorModule.COMPONENT_CATEGORY)
            .setId(COMPONENT_ID)
            .setModuleId(StatusIndicatorModule.MODULE_ID)
            .setSchema(SCHEMA)
            .setName("Gauge")
            .addPaletteEntry("", "Gauge", "A circular arc gauge with threshold colors.", null, null)
            .setDefaultMetaName("gauge")
            .setResources(StatusIndicatorModule.BROWSER_RESOURCES)
            .build();
}
