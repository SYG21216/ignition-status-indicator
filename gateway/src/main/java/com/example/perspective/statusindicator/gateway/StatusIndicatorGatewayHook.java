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
import com.example.perspective.statusindicator.common.comp.Gauge;
import com.example.perspective.statusindicator.common.comp.LineChart;
import com.example.perspective.statusindicator.common.comp.BarChart;
import com.example.perspective.statusindicator.common.comp.StatCard;
import com.example.perspective.statusindicator.common.comp.TimeSeries;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Gateway-scope hook. Registers all custom Perspective components:
 *   - StatusIndicator
 *   - Gauge
 *   - LineChart
 *   - BarChart
 *   - StatCard
 */
public class StatusIndicatorGatewayHook extends AbstractGatewayModuleHook {

    private static final LoggerEx log = LoggerEx.newBuilder()
        .build("com.example.perspective.statusindicator.gateway");

    private GatewayContext gatewayContext;
    private PerspectiveContext perspectiveContext;
    private ComponentRegistry componentRegistry;

    @Override
    public void setup(GatewayContext context) {
        this.gatewayContext = context;
        log.info("Setting up Custom Components module.");
    }

    @Override
    public void startup(LicenseState activationState) {
        log.info("Starting Custom Components Gateway Hook.");

        this.perspectiveContext = PerspectiveContext.get(this.gatewayContext);
        this.componentRegistry  = this.perspectiveContext.getComponentRegistry();

        if (this.componentRegistry != null) {
            this.componentRegistry.registerComponent(StatusIndicator.DESCRIPTOR);
            this.componentRegistry.registerComponent(Gauge.DESCRIPTOR);
            this.componentRegistry.registerComponent(LineChart.DESCRIPTOR);
            this.componentRegistry.registerComponent(BarChart.DESCRIPTOR);
            this.componentRegistry.registerComponent(StatCard.DESCRIPTOR);
            this.componentRegistry.registerComponent(TimeSeries.DESCRIPTOR);
            log.info("All 6 custom components registered successfully.");
        } else {
            log.error("ComponentRegistry is null — custom components will not function!");
        }
    }

    @Override
    public void shutdown() {
        log.info("Shutting down Custom Components module.");
        if (this.componentRegistry != null) {
            this.componentRegistry.removeComponent(StatusIndicator.COMPONENT_ID);
            this.componentRegistry.removeComponent(Gauge.COMPONENT_ID);
            this.componentRegistry.removeComponent(LineChart.COMPONENT_ID);
            this.componentRegistry.removeComponent(BarChart.COMPONENT_ID);
            this.componentRegistry.removeComponent(StatCard.COMPONENT_ID);
            this.componentRegistry.removeComponent(TimeSeries.COMPONENT_ID);
        }
    }

    @Override
    public Optional<String> getMountedResourceFolder() {
        return Optional.of("mounted");
    }

    @Override
    public Optional<String> getMountPathAlias() {
        return Optional.of(StatusIndicatorModule.URL_ALIAS);
    }

    @Override
    public boolean isFreeModule() {
        return true;
    }

    @Override
    public void onMountedResourceRequest(String resourcePath, HttpServletResponse response) {
        super.onMountedResourceRequest(resourcePath, response);
    }
}
