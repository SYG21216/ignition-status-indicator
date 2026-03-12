plugins {
    `java-library`
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
}

dependencies {
    compileOnly(libs.ignition.common)
    compileOnly(libs.ignition.perspective.common)
    compileOnly(libs.google.guava)
    compileOnly(libs.ia.gson)
}
