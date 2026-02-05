const { Aki } = require("aki-api");
const axios = require("axios");

// تخزين الجلسات النشطة
const activeGames = new Map();

module.exports = {
  name: "Akinator API",
  category: "games",
  description: "لعبة أكيناتور الذكية باستخدام aki-api - مكتبة حديثة وموثوقة",
  route: "/akinator",
  method: "GET",
  usage: "/akinator?action=<action>&answer=<answer>&sessionId=<id>",
  
  handler: async (req, res) => {
    const startTime = Date.now();
    const { action, answer, sessionId, region = "ar", childMode = "false" } = req.query;

    try {
      // 🔥 الإجراء: بدء لعبة جديدة
      if (action === "start") {
        try {
          const aki = new Aki({ 
            region, 
            childMode: childMode === "true"
          });
          
          console.log(`🎮 بدء لعبة جديدة - المنطقة: ${region}`);
          await aki.start();
          
          // إنشاء معرف جلسة فريد
          const newSessionId = `aki_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // تخزين بيانات الجلسة
          const gameData = {
            aki,
            sessionId: newSessionId,
            startTime: Date.now(),
            region,
            childMode: childMode === "true",
            history: [{
              step: 0,
              question: aki.question,
              type: "first_question"
            }]
          };
          
          activeGames.set(newSessionId, gameData);
          
          // تنظيف الجلسات القديمة (أكبر من 30 دقيقة)
          cleanupOldSessions();
          
          return res.json({
            success: true,
            code: 200,
            message: "🎮 تم بدء لعبة أكيناتور بنجاح",
            sessionId: newSessionId,
            data: {
              question: aki.question,
              progress: Math.round(aki.progress),
              step: aki.currentStep,
              region,
              childMode: childMode === "true",
              answers: [
                { id: 0, text: "نعم", emoji: "✅" },
                { id: 1, text: "لا", emoji: "❌" },
                { id: 2, text: "لا أعلم", emoji: "🤷" },
                { id: 3, text: "ربما", emoji: "💭" },
                { id: 4, text: "ربما لا", emoji: "📉" }
              ]
            },
            timestamp: Date.now(),
            processedTime: ((Date.now() - startTime) / 1000).toFixed(3) + "s"
          });
          
        } catch (startError) {
          console.error("❌ خطأ في بدء اللعبة:", startError);
          return res.status(500).json({
            success: false,
            code: 500,
            message: "فشل في بدء اللعبة. قد يكون الخادم مشغولاً.",
            error: startError.message
          });
        }
      }

      // 🔥 الإجراء: الإجابة على سؤال
      if (action === "answer" && sessionId && answer !== undefined) {
        if (!activeGames.has(sessionId)) {
          return res.status(404).json({
            success: false,
            code: 404,
            message: "❌ الجلسة غير موجودة أو انتهت صلاحيتها",
            suggestion: "ابدأ لعبة جديدة باستخدام ?action=start"
          });
        }

        const gameData = activeGames.get(sessionId);
        const aki = gameData.aki;
        
        // تحويل الإجابة إلى رقم
        const answerMap = {
          '0': 0, 'نعم': 0, 'yes': 0, 'y': 0, '✅': 0,
          '1': 1, 'لا': 1, 'no': 1, 'n': 1, '❌': 1,
          '2': 2, 'لا أعلم': 2, 'idk': 2, 'dont_know': 2, '🤷': 2,
          '3': 3, 'ربما': 3, 'probably': 3, 'p': 3, '💭': 3,
          '4': 4, 'ربما لا': 4, 'probably_not': 4, 'pn': 4, '📉': 4
        };
        
        const answerId = answerMap[answer.toString().toLowerCase()];
        
        if (answerId === undefined) {
          return res.status(400).json({
            success: false,
            code: 400,
            message: "❌ إجابة غير صالحة",
            validAnswers: [
              "0 أو 'نعم' أو 'yes'",
              "1 أو 'لا' أو 'no'", 
              "2 أو 'لا أعلم' أو 'idk'",
              "3 أو 'ربما' أو 'probably'",
              "4 أو 'ربما لا' أو 'probably_not'"
            ]
          });
        }

        try {
          console.log(`🎯 إجابة على الجلسة ${sessionId}: ${answer} -> ${answerId}`);
          
          // تقديم الإجابة
          await aki.step(answerId);
          
          // تحديث تاريخ الجلسة
          gameData.history.push({
            step: aki.currentStep,
            answer: answerId,
            question: aki.question,
            progress: aki.progress,
            timestamp: Date.now()
          });

          // 🔮 التحقق إذا كان جاهزاً للتخمين
          const shouldGuess = aki.progress >= 75 || aki.currentStep >= 12;
          
          if (shouldGuess) {
            console.log(`🔮 جاهز للتخمين! النسبة: ${aki.progress}%`);
            await aki.win();
            
            if (aki.answers && aki.answers.length > 0) {
              const character = aki.answers[0];
              
              // جلب بيانات إضافية للشخصية
              const characterData = await getCharacterFullData(character.name);
              
              return res.json({
                success: true,
                code: 200,
                message: "🔮 لدي تخمين!",
                type: "guess",
                sessionId,
                data: {
                  guess: {
                    name: character.name,
                    arabicName: characterData.arabicName || character.name,
                    description: characterData.description,
                    probability: Math.round(character.proba * 100),
                    ranking: character.ranking,
                    image: characterData.image,
                    attributes: characterData.attributes || []
                  },
                  alternatives: aki.answers.slice(1, 3).map(c => ({
                    name: c.name,
                    probability: Math.round(c.proba * 100)
                  })),
                  step: aki.currentStep,
                  progress: Math.round(aki.progress),
                  confidence: getConfidenceLevel(aki.progress)
                },
                instructions: {
                  confirm: `للتأكيد: ?action=guess_yes&sessionId=${sessionId}`,
                  deny: `للرفض: ?action=guess_no&sessionId=${sessionId}`
                },
                timestamp: Date.now(),
                processedTime: ((Date.now() - startTime) / 1000).toFixed(3) + "s"
              });
            }
          }

          // استمرار الأسئلة
          return res.json({
            success: true,
            code: 200,
            message: "🧠 السؤال التالي",
            type: "question",
            sessionId,
            data: {
              question: aki.question,
              progress: Math.round(aki.progress),
              step: aki.currentStep,
              answers: [
                { id: 0, text: "نعم", emoji: "✅" },
                { id: 1, text: "لا", emoji: "❌" },
                { id: 2, text: "لا أعلم", emoji: "🤷" },
                { id: 3, text: "ربما", emoji: "💭" },
                { id: 4, text: "ربما لا", emoji: "📉" }
              ],
              historyLength: gameData.history.length,
              confidence: getConfidenceLevel(aki.progress)
            },
            timestamp: Date.now(),
            processedTime: ((Date.now() - startTime) / 1000).toFixed(3) + "s"
          });
          
        } catch (stepError) {
          console.error("❌ خطأ في معالجة الإجابة:", stepError);
          return res.status(500).json({
            success: false,
            code: 500,
            message: "فشل في معالجة الإجابة",
            error: stepError.message,
            sessionId // إرجاع المعرف للمستخدم للمحاولة مرة أخرى
          });
        }
      }

      // 🔥 الإجراء: تأكيد التخمين
      if (action === "guess_yes" && sessionId) {
        if (!activeGames.has(sessionId)) {
          return res.status(404).json({
            success: false,
            code: 404,
            message: "❌ الجلسة غير موجودة"
          });
        }

        const gameData = activeGames.get(sessionId);
        const aki = gameData.aki;
        
        // التأكد من وجود تخمين
        if (!aki.answers || aki.answers.length === 0) {
          return res.status(400).json({
            success: false,
            code: 400,
            message: "❌ لا يوجد تخمين حالياً"
          });
        }

        const character = aki.answers[0];
        const characterData = await getCharacterFullData(character.name);
        
        // حذف الجلسة بعد النجاح
        activeGames.delete(sessionId);
        
        return res.json({
          success: true,
          code: 200,
          message: "🎉🎊🎉 إيـهــا .. لـقـد أخـطـرتـنـي بـهـا 🎉🎊🎉",
          type: "victory",
          data: {
            character: {
              name: character.name,
              arabicName: characterData.arabicName || character.name,
              description: characterData.description,
              image: characterData.image,
              probability: Math.round(character.proba * 100),
              ranking: character.ranking
            },
            stats: {
              totalSteps: aki.currentStep,
              totalQuestions: gameData.history.length,
              finalProgress: Math.round(aki.progress),
              gameDuration: ((Date.now() - gameData.startTime) / 1000).toFixed(1) + "s"
            },
            achievement: getAchievement(aki.currentStep)
          },
          celebration: "🎆✨🎇🎊",
          timestamp: Date.now(),
          processedTime: ((Date.now() - startTime) / 1000).toFixed(3) + "s"
        });
      }

      // 🔥 الإجراء: رفض التخمين
      if (action === "guess_no" && sessionId) {
        if (!activeGames.has(sessionId)) {
          return res.status(404).json({
            success: false,
            code: 404,
            message: "❌ الجلسة غير موجودة"
          });
        }

        const gameData = activeGames.get(sessionId);
        const aki = gameData.aki;
        
        // مسح التخمين الحالي والاستمرار
        aki.answers = [];
        
        // إضافة رسالة للتاريخ
        gameData.history.push({
          step: aki.currentStep,
          type: "guess_rejected",
          timestamp: Date.now()
        });

        return res.json({
          success: true,
          code: 200,
          message: "🔄 حسناً! دعني أسألك سؤالاً آخر...",
          type: "continue",
          sessionId,
          data: {
            question: aki.question,
            progress: Math.round(aki.progress),
            step: aki.currentStep,
            answers: [
              { id: 0, text: "نعم", emoji: "✅" },
              { id: 1, text: "لا", emoji: "❌" },
              { id: 2, text: "لا أعلم", emoji: "🤷" },
              { id: 3, text: "ربما", emoji: "💭" },
              { id: 4, text: "ربما لا", emoji: "📉" }
            ]
          },
          timestamp: Date.now(),
          processedTime: ((Date.now() - startTime) / 1000).toFixed(3) + "s"
        });
      }

      // 🔥 الإجراء: معلومات الجلسة
      if (action === "info" && sessionId) {
        if (!activeGames.has(sessionId)) {
          return res.status(404).json({
            success: false,
            code: 404,
            message: "❌ الجلسة غير موجودة"
          });
        }

        const gameData = activeGames.get(sessionId);
        const aki = gameData.aki;
        
        return res.json({
          success: true,
          code: 200,
          message: "📊 معلومات الجلسة",
          sessionId,
          data: {
            sessionInfo: {
              sessionId,
              region: gameData.region,
              childMode: gameData.childMode,
              startTime: new Date(gameData.startTime).toISOString(),
              age: Math.floor((Date.now() - gameData.startTime) / 1000) + " ثانية",
              isActive: true
            },
            gameInfo: {
              currentStep: aki.currentStep,
              progress: Math.round(aki.progress),
              questionCount: gameData.history.length,
              hasGuess: !!(aki.answers && aki.answers.length > 0)
            },
            history: {
              totalQuestions: gameData.history.length,
              lastQuestion: gameData.history[gameData.history.length - 1]?.question || "لا يوجد"
            }
          },
          timestamp: Date.now(),
          processedTime: ((Date.now() - startTime) / 1000).toFixed(3) + "s"
        });
      }

      // 🔥 الإجراء: العودة خطوة للخلف
      if (action === "back" && sessionId) {
        if (!activeGames.has(sessionId)) {
          return res.status(404).json({
            success: false,
            code: 404,
            message: "❌ الجلسة غير موجودة"
          });
        }

        const gameData = activeGames.get(sessionId);
        const aki = gameData.aki;
        
        try {
          await aki.back();
          
          // إزالة آخر إدخال من التاريخ
          if (gameData.history.length > 0) {
            gameData.history.pop();
          }

          return res.json({
            success: true,
            code: 200,
            message: "↩️ عدت للخلف بنجاح",
            sessionId,
            data: {
              question: aki.question,
              progress: Math.round(aki.progress),
              step: aki.currentStep,
              historyLength: gameData.history.length
            },
            timestamp: Date.now(),
            processedTime: ((Date.now() - startTime) / 1000).toFixed(3) + "s"
          });
        } catch (backError) {
          return res.status(400).json({
            success: false,
            code: 400,
            message: "❌ لا يمكن العودة أكثر من ذلك",
            sessionId
          });
        }
      }

      // 🔥 الإجراء: إلغاء/إنهاء الجلسة
      if (action === "end" && sessionId) {
        if (!activeGames.has(sessionId)) {
          return res.status(404).json({
            success: false,
            code: 404,
            message: "❌ الجلسة غير موجودة"
          });
        }

        activeGames.delete(sessionId);
        
        return res.json({
          success: true,
          code: 200,
          message: "🛑 تم إنهاء الجلسة بنجاح",
          sessionId,
          data: {
            ended: true,
            activeSessions: activeGames.size
          },
          timestamp: Date.now(),
          processedTime: ((Date.now() - startTime) / 1000).toFixed(3) + "s"
        });
      }

      // 🔥 الإجراء: قائمة الجلسات النشطة
      if (action === "list") {
        const sessionsList = Array.from(activeGames.entries()).map(([id, data]) => ({
          sessionId: id,
          region: data.region,
          progress: Math.round(data.aki.progress),
          step: data.aki.currentStep,
          age: Math.floor((Date.now() - data.startTime) / 1000) + "s",
          hasGuess: !!(data.aki.answers && data.aki.answers.length > 0)
        }));
        
        return res.json({
          success: true,
          code: 200,
          message: "📋 الجلسات النشطة",
          data: {
            total: activeGames.size,
            sessions: sessionsList
          },
          timestamp: Date.now(),
          processedTime: ((Date.now() - startTime) / 1000).toFixed(3) + "s"
        });
      }

      // 🔥 إذا لم يتم تحديد إجراء صالح
      return res.status(400).json({
        success: false,
        code: 400,
        message: "❌ إجراء غير صالح أو ناقص",
        documentation: {
          baseUrl: req.protocol + "://" + req.get("host") + req.baseUrl,
          availableActions: {
            start: "بدء لعبة جديدة",
            answer: "الإجابة على سؤال (مع sessionId و answer)",
            guess_yes: "تأكيد التخمين (مع sessionId)",
            guess_no: "رفض التخمين (مع sessionId)",
            info: "معلومات الجلسة (مع sessionId)",
            back: "العودة خطوة للخلف (مع sessionId)",
            end: "إنهاء الجلسة (مع sessionId)",
            list: "قائمة الجلسات النشطة"
          },
          examples: {
            start: "/akinator?action=start&region=ar&childMode=false",
            answer: "/akinator?action=answer&sessionId=aki_123456&answer=نعم",
            guess_yes: "/akinator?action=guess_yes&sessionId=aki_123456"
          }
        }
      });

    } catch (err) {
      console.error("🔥 خطأ غير متوقع في Akinator API:", err);
      return res.status(500).json({
        success: false,
        code: 500,
        message: "🔥 حدث خطأ داخلي في الخادم",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
        timestamp: Date.now()
      });
    }
  }
};

// ========== الوظائف المساعدة ==========

/**
 * جلب بيانات كاملة للشخصية
 */
async function getCharacterFullData(characterName) {
  try {
    console.log(`🔍 البحث عن بيانات لـ: ${characterName}`);
    
    // جلب الصورة
    const imageUrl = await getCharacterImage(characterName);
    
    // جلب الوصف (باستخدام ترجمة جوجل أو وصف مسبق)
    const description = await getCharacterDescription(characterName);
    
    // محاولة ترجمة الاسم للعربية
    const arabicName = await translateToArabic(characterName);
    
    return {
      name: characterName,
      arabicName: arabicName || characterName,
      description: description || `شخصية ${characterName} المشهورة`,
      image: imageUrl,
      attributes: ["شخصية مشهورة", "معروفة عالمياً"]
    };
    
  } catch (error) {
    console.error("❌ خطأ في جلب بيانات الشخصية:", error);
    return {
      name: characterName,
      arabicName: characterName,
      description: `شخصية ${characterName} المشهورة`,
      image: "https://i.imgur.com/3eCjY9W.png",
      attributes: ["شخصية معروفة"]
    };
  }
}

/**
 * جلب صورة الشخصية من API
 */
async function getCharacterImage(characterName) {
  try {
    const encodedName = encodeURIComponent(characterName);
    const response = await axios.get(
      `https://api.siputzx.my.id/api/images?query=${encodedName}`,
      { timeout: 15000 }
    );
    
    if (response.data?.status && response.data?.data?.length > 0) {
      // اختيار صورة ذات جودة جيدة
      const goodImage = response.data.data.find(img => 
        img.width >= 300 && img.height >= 300 && 
        !img.url.includes("google.com/search")
      );
      
      return goodImage?.url || response.data.data[0].url;
    }
    
    // صورة افتراضية
    return "https://i.imgur.com/3eCjY9W.png";
    
  } catch (error) {
    console.error("❌ خطأ في جلب الصورة:", error.message);
    return "https://i.imgur.com/3eCjY9W.png";
  }
}

/**
 * جلب وصف للشخصية
 */
async function getCharacterDescription(characterName) {
  try {
    // محاولة جلب من ويكيبيديا أو مصدر معرفي
    const response = await axios.get(
      `https://ar.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=true&titles=${encodeURIComponent(characterName)}`,
      { timeout: 10000 }
    );
    
    const pages = response.data?.query?.pages;
    if (pages) {
      const page = Object.values(pages)[0];
      if (page?.extract) {
        // تنظيف HTML واختصار النص
        const cleanText = page.extract
          .replace(/<[^>]*>/g, '')
          .substring(0, 300)
          .trim() + '...';
        
        return cleanText;
      }
    }
    
    return `شخصية ${characterName} المشهورة والمعروفة في الثقافة الشعبية.`;
    
  } catch (error) {
    return `شخصية ${characterName} المشهورة والمعروفة في الثقافة الشعبية.`;
  }
}

/**
 * ترجمة الاسم للعربية
 */
async function translateToArabic(text) {
  try {
    const response = await axios.get(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(text)}`,
      { timeout: 5000 }
    );
    
    return response.data[0][0][0] || text;
  } catch (error) {
    return text;
  }
}

/**
 * مستوى الثقة بناءً على النسبة
 */
function getConfidenceLevel(progress) {
  if (progress >= 90) return { level: "عالية جداً", emoji: "🎯" };
  if (progress >= 75) return { level: "عالية", emoji: "🔮" };
  if (progress >= 60) return { level: "متوسطة", emoji: "🧠" };
  if (progress >= 40) return { level: "منخفضة", emoji: "🤔" };
  return { level: "مبتدئة", emoji: "🎲" };
}

/**
 * الإنجاز بناءً على عدد الخطوات
 */
function getAchievement(steps) {
  if (steps <= 5) return { title: "عبقري! ⚡", message: "خمنت في أقل من 5 أسئلة!" };
  if (steps <= 10) return { title: "محترف! 🎯", message: "أداء رائع!" };
  if (steps <= 15) return { title: "جيد! 👍", message: "أداء جيد" };
  return { title: "صبور! 🐢", message: "استمرارية ممتازة" };
}

/**
 * تنظيف الجلسات القديمة
 */
function cleanupOldSessions() {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;
  let cleaned = 0;
  
  for (const [id, data] of activeGames.entries()) {
    if (now - data.startTime > thirtyMinutes) {
      activeGames.delete(id);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 تم تنظيف ${cleaned} جلسة قديمة. المتبقي: ${activeGames.size}`);
  }
}

// تصدير متغير activeGames لأغراض التطوير
module.exports.activeGames = activeGames;

// تنظيف الجلسات كل 10 دقائق
setInterval(cleanupOldSessions, 10 * 60 * 1000);
