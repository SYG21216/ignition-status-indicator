package com.example.perspective.statusindicator.common.comp;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;
import com.example.perspective.statusindicator.common.StatusIndicatorModule;

/**
 * Java-side descriptor for the StatusIndicator Perspective component.
 *
 * IMPORTANT: {@code COMPONENT_ID} must exactly match the value returned by
 * {@code getComponentType()} in the JavaScript {@code StatusIndicatorMeta} class.
 * Ignition uses this ID to bind the Java descriptor to its browser counterpart.
 *
 * Component capabilities:
 *   - LED-style circular status indicator
 *   - Four built-in status states: ok / warn / error / off
 *   - Text label (positioned above, below, left, right, or hidden)
 *   - Blink animation with configurable speed
 *   - Optional glow / shadow effect
 *   - Custom color override
 *   - Configurable indicator size, font size, and font color
 */
public class StatusIndicator {

    /**
     * Component type ID shared between Java and JavaScript.
     * Must match {@code getComponentType()} in statusindicator.js.
     */
    public static final String COMPONENT_ID = "com.example.perspective.statusindicator";

    /**
     * Loads the property schema from the classpath resource
     * {@code /statusindicator.props.json}.  The schema drives
     * the type-checked property editor in Perspective Designer.
     */
    public static final JsonSchema SCHEMA =
        JsonSchema.parse(
            StatusIndicatorModule.class.getResourceAsStream("/statusindicator.props.json")
        );

    /**
     * ComponentDescriptor registered with the Perspective ComponentRegistry.
     * Includes palette metadata, default instance name, and browser resources.
     */
    public static final ComponentDescriptor DESCRIPTOR =
        ComponentDescriptorImpl.ComponentBuilder.newBuilder()
            .setPaletteCategory(StatusIndicatorModule.COMPONENT_CATEGORY)
            .setId(COMPONENT_ID)
            .setModuleId(StatusIndicatorModule.MODULE_ID)
            .setSchema(SCHEMA)
            .setName("Status Indicator")
            .addPaletteEntry(
                "",
                "Status Indicator",
                "An LED-style status indicator with label, color, and blink support.",
                null,
                null
            )
            .setDefaultMetaName("statusIndicator")
            .setResources(StatusIndicatorModule.BROWSER_RESOURCES)
            .build();
}
