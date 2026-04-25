const { v2: cloudinary } = require("cloudinary");
const config = require("./config");

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

function isCloudinaryEnabled() {
  return Boolean(
    config.cloudinary.cloudName &&
      config.cloudinary.apiKey &&
      config.cloudinary.apiSecret
  );
}

module.exports = {
  cloudinary,
  isCloudinaryEnabled,
};
