module.exports = (api) => {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      [
        "@babel/plugin-transform-flow-strip-types",
        { allowDeclareFields: true },
      ],
      "react-native-worklets/plugin",
    ],
  };
};
