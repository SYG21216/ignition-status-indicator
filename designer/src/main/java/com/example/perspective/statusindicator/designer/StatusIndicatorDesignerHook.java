package com.example.perspective.statusindicator.designer;

import com.inductiveautomation.ignition.common.licensing.LicenseState;
import com.inductiveautomation.ignition.common.util.LoggerEx;
import com.inductiveautomation.ignition.designer.model.AbstractDesignerModuleHook;
import com.inductiveautomation.ignition.designer.model.DesignerContext;
import com.inductiveautomation.perspective.designer.DesignerComponentRegistry;
import com.inductiveautomation.perspective.designer.api.ComponentDesignDelegateRegistry;
import com.inductiveautomation.perspective.designer.api.PerspectiveDesignerInterface;
import com.example.perspective.statusindicator.common.comp.StatusIndicator;
import com.example.perspective.statusindicator.common.comp.Gauge;
import com.example.perspective.statusindicator.common.comp.LineChart;
import com.example.perspective.statusindicator.common.comp.BarChart;
import com.example.perspective.statusindicator.common.comp.StatCard;

/**
 * Designer-scope hook. Registers all custom components onto the palette
 * under the "Components" category.
 */
public class StatusIndicatorDesignerHook extends AbstractDesignerModuleHook {

    private static final LoggerEx logger = LoggerEx.newBuilder()
        .build("com.example.perspective.statusindicator.designer");

    private DesignerContext context;
    private DesignerComponentRegistry registry;
    private ComponentDesignDelegateRegistry delegateRegistry;

    public StatusIndicatorDesignerHook() {
        logger.info("StatusIndicatorDesignerHook instantiated.");
    }

    @Override
    public void startup(DesignerContext context, LicenseState activationState) {
        this.context = context;
        init();
    }

    private void init() {
        logger.debug("Initializing custom components in Designer registry...");

        PerspectiveDesignerInterface pdi = PerspectiveDesignerInterface.get(context);
        registry         = pdi.getDesignerComponentRegistry();
        delegateRegistry = pdi.getComponentDesignDelegateRegistry();

        registry.registerComponent(StatusIndicator.DESCRIPTOR);
        registry.registerComponent(Gauge.DESCRIPTOR);
        registry.registerComponent(LineChart.DESCRIPTOR);
        registry.registerComponent(BarChart.DESCRIPTOR);
        registry.registerComponent(StatCard.DESCRIPTOR);

        logger.info("All 5 custom components registered in Designer palette under 'Components' category.");
    }

    @Override
    public void shutdown() {
        if (registry != null) {
            registry.removeComponent(StatusIndicator.COMPONENT_ID);
            registry.removeComponent(Gauge.COMPONENT_ID);
            registry.removeComponent(LineChart.COMPONENT_ID);
            registry.removeComponent(BarChart.COMPONENT_ID);
            registry.removeComponent(StatCard.COMPONENT_ID);
            logger.info("All custom components removed from Designer registry.");
        }
    }
}
