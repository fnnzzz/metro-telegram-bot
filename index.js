const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const express = require("express");
const MongoClient = require("mongodb").MongoClient;

const app = express();
const port = 80;

axios.defaults.headers.common = { "Accept-Language": "ru" };

const mongoDbUrl = `mongodb+srv://magicleadadmin:${process.env.MONGODB_PASSWORD}@sychidev.ki7vx.mongodb.net/<dbname>?retryWrites=true&w=majority`;

const client = new MongoClient(mongoDbUrl, { useUnifiedTopology: true });

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const API_URL = `https://stores-api.zakaz.ua/stores/48215616`;

let addProductInProccesing = false;

bot.onText(/\/add(@\w+)?\s(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const resp = match[2];

  axios
    .get(`${API_URL}/products/search_old/?q=${encodeURIComponent(resp)}`)
    .then(({ data }) => {
      let { results = [] } = data;

      if (!results.length) {
        return bot.sendMessage(chatId, "Сорян братан, ниче не нашел 🙈🙉🙊");
      }

      results = results.slice(0, 10);

      const text = results
        .map((product) => {
          return `<a href="https://metro.zakaz.ua/ru/products/${
            product.ean
          }/">${product.title}</a>\n<b>${(product.price / 100).toFixed(
            2
          )} грн</b>`;
        })
        .join("\n\n");

      bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: results.map((product) => {
            return [
              {
                text: product.title,
                callback_data: JSON.stringify({
                  title: product.title,
                  bundle: product.bundle,
                  ean: product.ean,
                  unit: product.unit,
                }),
              },
            ];
          }),
        },
      });
    })
    .catch((err) => {
      bot.sendMessage(chatId, `${err}`);
    });
});

bot.on("callback_query", (cbQuery) => {
  bot.answerCallbackQuery(cbQuery.id, {
    text: "👌",
  });

  const data = JSON.parse(cbQuery.data);

  bot.sendMessage(cbQuery.message.chat.id, data.title);

  let text = "";

  if (data.unit === "kg") {
    text = "Скажи скок тебе надо килограммов? (например: 1.2)";
  }

  if (data.unit === "pcs") {
    const unit = data.bundle > 1 ? "упаковок" : "штук";
    text = `Скажи скок тебе надо ${unit}?`;
    if (data.bundle > 1) {
      text += `\n(в упаковке ${data.bundle} штук)`;
    }
  }

  bot.sendMessage(cbQuery.message.chat.id, text);
  addProductInProccesing = data.ean || true;
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (addProductInProccesing) {
    if (+msg.text === 0 || msg.text.toLowerCase().trim() === "отмена") {
      addProductInProccesing = false;
      return bot.sendMessage(chatId, "❌ Охрана отмена");
    }

    if (!isNaN(msg.text)) {
      const productId = addProductInProccesing;
      axios
        .get(`${API_URL}/products/${productId}`)
        .then(({ data: product }) => {
          if (product) {
            client.connect(
              (err, _client) => {
                if (err) {
                  console.log(err);
                  return sendErrorMessage(chatId);
                }

                _client
                  .db("metro-bot")
                  .collection("orders")
                  .insertOne(
                    {
                      date: Date.now(),
                      amount: msg.text,
                      ean: product.ean,
                      isAvailable: true,
                      product,
                    },
                    (err, r) => {
                      if (err) {
                        console.log(err);
                        return sendErrorMessage(chatId);
                      }

                      addProductInProccesing = false;
                      bot.sendMessage(chatId, "😎 Окич, добавил в корзину");
                    }
                  );
              },
              (err) => {
                if (err) {
                  console.log(err);
                  sendErrorMessage(chatId);
                }
              }
            );
          } else {
            sendErrorMessage(chatId);
          }
        });
    }
  }
});

function sendErrorMessage(chatId) {
  bot.sendMessage(chatId, "😢 Шото проблемка какая-то возникла");
}

app.get("/get-cart", (req, res) => {
  client.connect((err, _client) => {
    const cursor = _client.db("metro-bot").collection("orders").find();

    const dbRes = [];

    cursor.each(function (err, item) {
      dbRes.push(item);

      if (item === null) {
        const formattedResponse = dbRes.reduce((acc, item) => {
          if (item === null) {
            return acc;
          }

          const hasYet = acc.findIndex((_item) => item.ean === _item.ean);

          if (hasYet !== -1) {
            acc[hasYet] = {
              ...acc[hasYet],
              amount: `${+acc[hasYet].amount + +item.amount}`,
            };
            return acc;
          }

          return [...acc, item];
        }, []);

        res.json(formattedResponse.reverse());
      }
    });
  });
});

app.listen(port, () =>
  console.log(`Example app listening at http://localhost:${port}`)
);
