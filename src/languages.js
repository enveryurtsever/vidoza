const LANGUAGES = {
  tr: {
    label: "Turkce",
    name: "Turkish",
    cta: "Daha fazlasi icin takip edin!",
    voices: [
      { id: "tr-TR-AhmetNeural", label: "Ahmet (Erkek)", gender: "male" },
      { id: "tr-TR-EmelNeural", label: "Emel (Kadin)", gender: "female" },
      { id: "en-US-AvaMultilingualNeural", label: "Ava Multilingual (Kadin)", gender: "female" },
    ],
    defaultVoice: "tr-TR-AhmetNeural",
  },
  en: {
    label: "English",
    name: "English",
    cta: "Follow for more!",
    voices: [
      { id: "en-US-AndrewNeural", label: "Andrew (Male)", gender: "male" },
      { id: "en-US-JennyNeural", label: "Jenny (Female)", gender: "female" },
      { id: "en-US-AriaNeural", label: "Aria (Female)", gender: "female" },
    ],
    defaultVoice: "en-US-AndrewNeural",
  },
  es: {
    label: "Espanol",
    name: "Spanish (Latin America)",
    cta: "Siguenos para mas!",
    voices: [
      { id: "es-MX-JorgeNeural", label: "Jorge (Hombre)", gender: "male" },
      { id: "es-MX-DaliaNeural", label: "Dalia (Mujer)", gender: "female" },
      { id: "es-CO-SalomeNeural", label: "Salome (Mujer)", gender: "female" },
    ],
    defaultVoice: "es-MX-JorgeNeural",
  },
};

module.exports = { LANGUAGES };
