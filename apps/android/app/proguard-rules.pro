# protobuf-javalite finds each message's fields by name, by reflection, and
# ships no rule for them (java/lite.md in protocolbuffers/protobuf).
# connect-kotlin's javalite codec reaches a message's getDefaultInstance by
# reflection too, and ships no rule for it. Everything else is reached
# directly, so only these are kept.
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite {
  <fields>;
  public static ** getDefaultInstance();
}

# Glance tells its widgets apart by their GlanceAppWidget's class name: each
# receiver is filed under its widget's name, and updateAll(SimpleWidget)
# updates every widget whose receiver is filed under SimpleWidget's. R8
# merged the kinds that share PochicalWidget into one class, so updating one
# kind drew it into the others (a placed いまのシフト showed シンプル). Their
# names kept, each kind is its own class.
-keepnames class * extends androidx.glance.appwidget.GlanceAppWidget
