// Implementation tracked in issue #18
exports.handler = async (event) => {
  console.log('InboundEmailProcessor triggered', JSON.stringify(event));
};
