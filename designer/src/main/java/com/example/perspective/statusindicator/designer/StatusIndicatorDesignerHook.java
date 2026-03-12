package com.example.perspective.statusindicator.designer;

import com.inductiveautomation.ignition.common.licensing.LicenseState;
import com.inductiveautomation.ignition.common.util.LoggerEx;
import com.inductiveautomation.ignition.designer.model.AbstractDesignerModuleHook;
import com.inductiveautomation.ignition.designer.model.DesignerContext;
import com.inductiveautomation.perspective.designer.DesignerComponentRegistry;
import com.inductiveautomation.perspective.designer.api.ComponentDesignDelegateRegistry;
import com.inductiveautomation.perspective.designer.api.PerspectiveDesignerInterface;
import com.example.perspective.statusindicator.common.comp.StatusIndicator;

/**
 * Designer-scope hook for the StatusIndicator module.
 *
 * Responsibilities:
 *   - Register StatusIndicator with the Perspective Designer ComponentRegistry
 *     so it appears on the component palette.
 *   - Unregister the component when the module is unloaded or the Designer exits.
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

    // ---------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------

    @Override
    public void startup(DesignerContext context, LicenseState activationState) {
        this.context = context;
        init();
    }

    private void init() {
        logger.debug("Initializing StatusIndicator in Designer component registry...");

        PerspectiveDesignerInterface pdi = PerspectiveDesignerInterface.get(context);
        registry         = pdi.getDesignerComponentRegistry();
        delegateRegistry = pdi.getComponentDesignDelegateRegistry();

        registry.registerComponent(StatusIndicator.DESCRIPTOR);

        logger.info("StatusIndicator registered in Designer palette.");
    }

    @Override
    public void shutdown() {
        removeComponents();
    }

    private void removeComponents() {
        if (registry != null) {
            registry.removeComponent(StatusIndicator.COMPONENT_ID);
            logger.info("StatusIndicator removed from Designer registry.");
        }
    }
}
