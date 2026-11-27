# LunaCycle Release R8 / ProGuard Rules (Capacitor 8 + Biometric + LocalNotifications)

# Preserve Capacitor Bridge, Plugins, and WebView JSInterface reflection targets
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class ee.forgr.biometric.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class * extends com.getcapacitor.BridgeActivity { *; }

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
    @com.getcapacitor.PluginMethod <methods>;
}

# Preserve Android BroadcastReceivers / Services declared in merged manifests
-keep class * extends android.content.BroadcastReceiver { *; }
-keep class * extends android.app.Service { *; }

# Keep stack trace line numbers for Play Console deobfuscation mapping
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
