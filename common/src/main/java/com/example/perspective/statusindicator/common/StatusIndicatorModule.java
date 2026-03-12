package com.example.perspective.statusindicator.common;

import java.util.Set;
import com.inductiveautomation.perspective.common.api.BrowserResource;

/**
 * Holds module-level constants and browser resource declarations shared
 * by both the gateway and designer scopes.
 *
 * URL_ALIAS must match the value returned by
 * {@code StatusIndicatorGatewayHook#getMountPathAlias()}, and determines the
 * public path under which static files are served:
 * {@code /res/{URL_ALIAS}/...}
 */
public class StatusIndicatorModule {

    /** Unique module identifier — must equal the id set in build.gradle.kts. */
    public static final String MODULE_ID = "com.example.perspective.statusindicator";

    /** Path alias for the gateway-mounted static resources folder. */
    public static final String URL_ALIAS = "statusindicator";

    /** Palette category label shown in the Perspective Designer component panel. */
    public static final String COMPONENT_CATEGORY = "Components";

    /**
     * Browser resources (JS + CSS) that Perspective will inject into every
     * session that uses this module's components.
     */
    public static final Set<BrowserResource> BROWSER_RESOURCES = Set.of(
        new BrowserResource(
            "status-indicator-js",
            String.format("/res/%s/js/statusindicator.js", URL_ALIAS),
            BrowserResource.ResourceType.JS
        ),
        new BrowserResource(
            "status-indicator-css",
            String.format("/res/%s/css/statusindicator.css", URL_ALIAS),
            BrowserResource.ResourceType.CSS
        )
    );
}
