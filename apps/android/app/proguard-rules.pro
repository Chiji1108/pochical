# protobuf-javalite finds each message's fields by name, by reflection, and
# ships no rule for them (java/lite.md in protocolbuffers/protobuf).
# connect-kotlin's javalite codec reaches a message's getDefaultInstance by
# reflection too, and ships no rule for it. Everything else is reached
# directly, so only these are kept.
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite {
  <fields>;
  public static ** getDefaultInstance();
}
