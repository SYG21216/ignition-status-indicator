import io.ia.sdk.gradle.modl.task.Deploy

plugins {
    base
    id("io.ia.sdk.modl") version("0.1.1")
}

allprojects {
    version = "1.0.0-SNAPSHOT"
    group   = "com.example.perspective.statusindicator"
}

ignitionModule {
    // ── 모듈 파일명 / 메타 ──────────────────────────────────────────
    fileName.set("StatusIndicatorComponent")

    name.set("Status Indicator Component")
    id.set("com.example.perspective.statusindicator")
    moduleVersion.set("${project.version}")
    moduleDescription.set("A custom Perspective component that displays a colored LED-style status indicator with label and blink support.")

    // Ignition 8.3.3 이상에서 동작
    requiredIgnitionVersion.set("8.3.3")
    requiredFrameworkVersion.set("8")

    freeModule.set(true)
    license.set("license.html")

    // Perspective 모듈에 의존 (Gateway + Designer 스코프)
    moduleDependencies.putAll(
        mapOf(
            "com.inductiveautomation.perspective" to "GD"
        )
    )

    // 서브프로젝트 → Ignition 스코프 매핑
    projectScopes.putAll(
        mapOf(
            ":gateway"  to "G",
            ":common"   to "DG",
            ":designer" to "D"
        )
    )

    // 각 스코프에서 로딩할 Hook 클래스
    hooks.putAll(
        mapOf(
            "com.example.perspective.statusindicator.gateway.StatusIndicatorGatewayHook"   to "G",
            "com.example.perspective.statusindicator.designer.StatusIndicatorDesignerHook" to "D"
        )
    )

    // 개발 중 서명 생략 (배포 시에는 제거하고 sign.props 설정 필요)
    skipModlSigning.set(true)
}

val deepClean by tasks.registering {
    dependsOn(allprojects.map { "${it.path}:clean" })
    description = "Executes clean tasks and removes Gradle caches."
    doLast {
        delete(file(".gradle"))
    }
}
