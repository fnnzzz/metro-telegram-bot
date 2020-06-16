const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const express = require("express");
const MongoClient = require("mongodb").MongoClient;
const cors = require("cors");
const format = require("date-fns/format");
const ruLocale = require("date-fns/locale/ru");

const app = express();
const port = 80;
app.use(cors());

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
        return bot.sendMessage(chatId, "Сорян братан, ниче не нашел 🙈🙉🙊", {
          disable_notification: true,
        });
      }

      results = results.slice(0, 10);

      const text = results
        .map((product) => {
          const _formatPrice = (price) => (price / 100).toFixed(2) + " грн";

          let priceText = "";

          if (product.discount && product.discount.status) {
            const { old_price, due_date, value } = product.discount;
            const formattedDate = format(new Date(due_date), "dd MMMM", {
              locale: ruLocale,
            });

            priceText = `<s>${_formatPrice(
              old_price
            )}</s> 🤑💸💰 ${_formatPrice(
              product.price
            )} (скидон <u>${value}%</u> до ${formattedDate})`;
          } else {
            priceText = _formatPrice(product.price);
          }

          return `<a href="https://metro.zakaz.ua/ru/products/${product.ean}/">${product.title}</a>\n<b>${priceText}</b>`;
        })
        .join("\n\n");

      bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        disable_notification: true,
        reply_markup: {
          inline_keyboard: results.map((product, index) => {
            return [
              {
                text: product.title,
                callback_data: JSON.stringify({
                  index,
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
      bot.sendMessage(chatId, `${err}`, { disable_notification: true });
    });
});

bot.on("callback_query", (cbQuery) => {
  bot.answerCallbackQuery(cbQuery.id, {
    text: "👌",
  });

  const data = JSON.parse(cbQuery.data);

  bot.sendMessage(
    cbQuery.message.chat.id,
    "👉👉👉 " + cbQuery.message.reply_markup.inline_keyboard[data.index][0].text
  );

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

  bot.sendMessage(cbQuery.message.chat.id, text, {
    disable_notification: true,
  });
  addProductInProccesing = data.ean || true;
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (addProductInProccesing) {
    if (+msg.text === 0 || msg.text.toLowerCase().trim() === "отмена") {
      addProductInProccesing = false;
      return bot.sendMessage(chatId, "❌ Охрана отмена", {
        disable_notification: true,
      });
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
                      bot.sendMessage(chatId, "😎 Окич, добавил в корзину", {
                        disable_notification: true,
                      });
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
  bot.sendMessage(chatId, "😢 Шото проблемка какая-то возникла", {
    disable_notification: true,
  });
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
