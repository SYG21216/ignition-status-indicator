package com.example.perspective.statusindicator.gateway;

import java.util.Optional;

import com.inductiveautomation.ignition.common.licensing.LicenseState;
import com.inductiveautomation.ignition.common.util.LoggerEx;
import com.inductiveautomation.ignition.gateway.model.AbstractGatewayModuleHook;
import com.inductiveautomation.ignition.gateway.model.GatewayContext;
import com.inductiveautomation.perspective.common.api.ComponentRegistry;
import com.inductiveautomation.perspective.gateway.api.PerspectiveContext;
import com.example.perspective.statusindicator.common.StatusIndicatorModule;
import com.example.perspective.statusindicator.common.comp.StatusIndicator;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Gateway-scope hook for the StatusIndicator module.
 *
 * Responsibilities:
 *   1. Register {@link StatusIndicator#DESCRIPTOR} with the Perspective ComponentRegistry.
 *   2. Serve static files (JS/CSS) from {@code resources/mounted/} under the
 *      path alias {@code /res/statusindicator/}.
 *   3. Unregister the component on module shutdown.
 */
public class StatusIndicatorGatewayHook extends AbstractGatewayModuleHook {

    private static final LoggerEx log = LoggerEx.newBuilder()
        .build("com.example.perspective.statusindicator.gateway");

    private GatewayContext gatewayContext;
    private PerspectiveContext perspectiveContext;
    private ComponentRegistry componentRegistry;

    // ---------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------

    @Override
    public void setup(GatewayContext context) {
        this.gatewayContext = context;
        log.info("Setting up StatusIndicator module.");
    }

    @Override
    public void startup(LicenseState activationState) {
        log.info("Starting StatusIndicator Gateway Hook.");

        this.perspectiveContext = PerspectiveContext.get(this.gatewayContext);
        this.componentRegistry  = this.perspectiveContext.getComponentRegistry();

        if (this.componentRegistry != null) {
            log.info("Registering StatusIndicator component.");
            this.componentRegistry.registerComponent(StatusIndicator.DESCRIPTOR);
        } else {
            log.error("ComponentRegistry is null — StatusIndicator module will not function!");
        }
    }

    @Override
    public void shutdown() {
        log.info("Shutting down StatusIndicator module — removing registered components.");
        if (this.componentRegistry != null) {
            this.componentRegistry.removeComponent(StatusIndicator.COMPONENT_ID);
        } else {
            log.warn("ComponentRegistry was null on shutdown.");
        }
    }

    // ---------------------------------------------------------------
    // Static resource serving
    // ---------------------------------------------------------------

    /**
     * Exposes {@code gateway/src/main/resources/mounted/} as a static
     * resource folder.  Sub-folders {@code js/} and {@code css/} must
     * exist inside it.
     */
    @Override
    public Optional<String> getMountedResourceFolder() {
        return Optional.of("mounted");
    }

    /**
     * Makes resources accessible at {@code /res/statusindicator/*}.
     * Must match {@link StatusIndicatorModule#URL_ALIAS}.
     */
    @Override
    public Optional<String> getMountPathAlias() {
        return Optional.of(StatusIndicatorModule.URL_ALIAS);
    }

    // ---------------------------------------------------------------
    // Licensing
    // ---------------------------------------------------------------

    @Override
    public boolean isFreeModule() {
        return true;
    }

    @Override
    public void onMountedResourceRequest(String resourcePath, HttpServletResponse response) {
        super.onMountedResourceRequest(resourcePath, response);
    }
}
