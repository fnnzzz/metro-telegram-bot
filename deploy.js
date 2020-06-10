const { exec } = require("child_process");

exec("docker build --rm -t metrobot .", (err, stdout) => {
  if (err) {
    console.log(err);
  }

  exec("docker stop metrobot-container || true", (err, stdout) => {
    if (err) {
      console.log(err);
    }
    console.log(stdout);

    exec(
      "docker run -d --rm -e BOT_TOKEN=${BOT_TOKEN} -e MONGODB_PASSWORD=${MONGODB_PASSWORD} -p 80:80 --name metrobot-container metrobot",
      (err, stdout) => {
        if (err) {
          console.log(err);
        }
        console.log(stdout);
      }
    );
  });
});
