const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

axios.defaults.headers.common = { "Accept-Language": "ru" };

const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

const API_URL = `https://stores-api.zakaz.ua/stores/48215616`;

let hasUncompletedCallback = false;

bot.onText(/\/metro add (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const resp = match[1];

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
  hasUncompletedCallback = true;
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (hasUncompletedCallback) {
    // msg.text save to storage
    if (!isNaN(msg.text)) {
      hasUncompletedCallback = false;
      bot.sendMessage(chatId, "😎 Окич, добавил в корзину");
    }
  }
});
