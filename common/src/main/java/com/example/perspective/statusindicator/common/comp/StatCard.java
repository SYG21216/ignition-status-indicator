package com.example.perspective.statusindicator.common.comp;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.example.perspective.statusindicator.common.StatusIndicatorModule;

/**
 * Stat Card component descriptor.
 * A KPI card showing a primary value, label, trend indicator, and unit.
 */
public class StatCard {

    public static final String COMPONENT_ID = "com.example.perspective.statcard";

    public static final JsonSchema SCHEMA =
        JsonSchema.parse(
            StatusIndicatorModule.class.getResourceAsStream("/statcard.props.json")
        );

    public static final ComponentDescriptor DESCRIPTOR =
        ComponentDescriptorImpl.ComponentBuilder.newBuilder()
            .setPaletteCategory(StatusIndicatorModule.COMPONENT_CATEGORY)
            .setId(COMPONENT_ID)
            .setModuleId(StatusIndicatorModule.MODULE_ID)
            .setSchema(SCHEMA)
            .setName("Stat Card")
            .addPaletteEntry("", "Stat Card", "A KPI card with value, label, unit and trend indicator.", null, null)
            .setDefaultMetaName("statCard")
            .setResources(StatusIndicatorModule.BROWSER_RESOURCES)
            .build();
}
