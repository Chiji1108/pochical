"use strict";
const { withPodfileProperties } = require("@expo/config-plugins");

// The TextInput patch must be compiled; prebuilt React Native ignores it.
module.exports = (config) =>
  withPodfileProperties(config, (mod) => {
    mod.modResults["ios.buildReactNativeFromSource"] = "true";
    return mod;
  });
