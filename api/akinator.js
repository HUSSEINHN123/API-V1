const Akinator = require("akinator-api");

module.exports = {
  name: "Akinator",
  category: "games",
  route: "/akinator",
  method: "get",
  usage: "/akinator?answer=نعم|لا|لا_أعلم|ربما|ربما_لا",
  description: "لعبة أكيناتور باللغة العربية",

  handler: async (req, res) => {
    try {
      const answerMap = {
        "نعم": "yes",
        "لا": "no",
        "لا_أعلم": "idk",
        "ربما": "probably",
        "ربما_لا": "probably_not"
      };

      const rawAnswer = req.query.answer || "start";
      const answer = answerMap[rawAnswer] || rawAnswer;

      // بدء اللعبة
      if (rawAnswer === "start") {
        const aki = new Akinator("ar");
        await aki.start();

        return res.json({
          status: true,
          question: aki.question,
          step: aki.step,
          session: aki.session,
          signature: aki.signature,
          answers: ["نعم", "لا", "لا_أعلم", "ربما", "ربما_لا"]
        });
      }

      const { session, signature, step } = req.query;
      if (!session || !signature || step === undefined) {
        return res.json({
          status: false,
          message: "❌ session و signature و step مطلوبة"
        });
      }

      const aki = new Akinator("ar");
      aki.session = session;
      aki.signature = signature;
      aki.step = Number(step);

      await aki.answer(answer);

      // إذا وصل للتخمين
      if (aki.progress >= 80) {
        await aki.win();
        return res.json({
          status: true,
          guessed: true,
          character: {
            name: aki.answers[0].name,
            description: aki.answers[0].description,
            image: aki.answers[0].absolute_picture_path
          }
        });
      }

      return res.json({
        status: true,
        guessed: false,
        question: aki.question,
        step: aki.step,
        progress: aki.progress
      });

    } catch (err) {
      res.json({
        status: false,
        error: err.message
      });
    }
  }
};
