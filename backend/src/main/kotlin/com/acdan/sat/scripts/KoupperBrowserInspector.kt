package com.acdan.sat.scripts

import com.koupper.container.app
import com.koupper.providers.browser.InteractiveBrowserProvider

object KoupperBrowserInspector {
    fun inspect() {
        val provider = app.getInstance(InteractiveBrowserProvider::class)
        val kClass = provider::class.java
        println("=== Methods on InteractiveBrowserProvider instance ===")
        kClass.methods.forEach { m ->
            println("${m.name}(${m.parameterTypes.joinToString { it.simpleName }}): ${m.returnType.simpleName}")
        }
    }
}
