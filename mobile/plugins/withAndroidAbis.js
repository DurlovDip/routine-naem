const { withGradleProperties } = require("@expo/config-plugins");

/** Phone ABIs only. x86 and x86_64 roughly doubled the release APK. */
const ABIS = "armeabi-v7a,arm64-v8a";

function withAndroidAbis(config) {
  return withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter(
      (item) => !(item.type === "property" && item.key === "reactNativeArchitectures"),
    );
    mod.modResults.push({
      type: "property",
      key: "reactNativeArchitectures",
      value: ABIS,
    });
    return mod;
  });
}

module.exports = withAndroidAbis;
