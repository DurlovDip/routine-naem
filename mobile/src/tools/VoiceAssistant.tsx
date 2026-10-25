import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { useSchedule } from "../store";
import { card, colors, radius, shadow, space } from "../theme";
import { Button, Field, Label, Segmented, T } from "../ui";
import { applyGeneratedGridToDay, type GridAssignment } from "./scheduleAlgorithm";

const STORAGE_GEMINI_KEY = "@gemini_api_key";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  plan?: {
    summary?: string;
    assignments: Array<{
      batchName: string;
      sessionIndex: number;
      teacherName: string;
    }>;
  };
};

export function VoiceAssistant() {
  const { state, dispatch, day } = useSchedule();

  // Gemini API Key state
  const [apiKey, setApiKey] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  // Voice Speech-to-Text State
  const [lang, setLang] = useState<"bn-BD" | "en-US">("bn-BD");
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);

  // Chat conversation state
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "স্বাগতম! আমি আপনার NAEM রুটিন সহকারী। আপনি মুখে বাংলায় বা ইংরেজিতে বলতে পারেন (যেমনঃ '৫টি ব্যাচের জন্য রুটিন বানিয়ে দাও, লিটন স্যার ২য় সেশনে ব্যস্ত'), আমি রুটিন তৈরি করে দিব অথবা যেকোনো প্রশ্ন থাকলে সাহায্য করব।",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web Speech Recognition reference
  const recognitionRef = useRef<any>(null);

  // Load API key from AsyncStorage or process.env on mount
  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_GEMINI_KEY);
        const envKey = (process.env as any)?.EXPO_PUBLIC_GEMINI_API_KEY;
        const key = stored || envKey || "";
        if (key) {
          setApiKey(key);
          setApiKeyInput(key);
        } else {
          setShowKeyConfig(true);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Check Web Speech API support
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
      }
    }
  }, []);

  // Toggle Voice Recognition
  function toggleListening() {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    if (Platform.OS !== "web" || typeof window === "undefined") {
      Alert.alert(
        "Voice Input",
        "Direct voice recording uses the browser Web Speech API. On native devices, you can use your keyboard's built-in microphone key or type below.",
      );
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      Alert.alert(
        "Speech Recognition",
        "Your browser does not support the Web Speech API. Chrome, Safari, and Edge support speech recognition. You can also type your instructions directly.",
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const current = Array.from(event.results)
          .map((r: any) => r[0]?.transcript || "")
          .join(" ");
        setTranscript(current);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error !== "no-speech") {
          setError(`Speech recognition note: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsListening(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Save API key
  async function handleSaveKey() {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    try {
      await AsyncStorage.setItem(STORAGE_GEMINI_KEY, trimmed);
      setApiKey(trimmed);
      setShowKeyConfig(false);
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Send message to Gemini API
  async function handleSend(textToSend?: string) {
    const input = (textToSend || transcript).trim();
    if (!input) return;

    if (!apiKey) {
      setShowKeyConfig(true);
      setError("Please configure your free Gemini API key first.");
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: input,
    };

    setMessages((prev) => [...prev, userMsg]);
    setTranscript("");
    setBusy(true);
    setError(null);

    try {
      const teacherList = state.teachers.map((t) => t.name).join(", ");
      const batchList =
        state.batches.length > 0
          ? state.batches.map((b) => b.name).join(", ")
          : "Batch 1, Batch 2, Batch 3, Batch 4, Batch 5";

      const systemPrompt = `You are the NAEM Routine AI Coordinator Assistant for National Academy for Educational Management daily schedule.
Registered teachers: ${teacherList || "Dr. Litan Kanti Halder, Dr. Nuruzzaman, Mr. Ariful, Dr. Rahman, Mr. Ali, Dr. Ayet"}
Current Batches: ${batchList}
Standard Sessions: 5 sessions per day (Session 1 to Session 5)
Current Day: Day ${day.dayNumber}

LANGUAGE SUPPORT:
- Support both Bangla (বাংলা) and English seamlessly.
- If user speaks or asks in Bangla, reply warmly in natural Bangla. If in English, reply in English.

TASK INSTRUCTIONS:
1. When the coordinator asks you to generate a routine or provides schedule details (who is teaching, which batches, who is busy/free, or how many sessions):
   - Formulate a conflict-free routine where NO teacher is assigned to more than 1 batch in the same session.
   - Respect any teacher unavailability mentioned (e.g. if teacher is busy in session 2, do not assign them in session 2).
   - Try NOT to give the same teacher to the same batch more than once across the day if possible (diversify teachers across batches).
   - In your response, provide an explanation AND a structured JSON block inside \`\`\`json ... \`\`\` like this:
\`\`\`json
{
  "type": "routine_plan",
  "summary": "Brief summary of the plan",
  "assignments": [
    { "batchName": "Batch 1", "sessionIndex": 0, "teacherName": "Dr. Litan Kanti Halder" },
    { "batchName": "Batch 2", "sessionIndex": 0, "teacherName": "Dr. Nuruzzaman" }
  ]
}
\`\`\`
   Note: sessionIndex is 0-indexed (0 for Session 1, 1 for Session 2, etc.).
2. If the user asks a question, gives feedback, or constraints are missing or contradictory, answer conversationally, explain clearly, and ask clarifying questions.
3. Module selection is manual for now, so you only assign teachers to batches and sessions.`;

      // Call Gemini Free Tier API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              ...messages
                .filter((m) => m.id !== "welcome")
                .map((m) => ({
                  role: m.role === "assistant" ? "model" : "user",
                  parts: [{ text: m.text }],
                })),
              { role: "user", parts: [{ text: input }] },
            ],
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
          }),
        },
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || "Gemini API error");
      }

      const replyText =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "I could not generate a response. Please check your instructions.";

      // Check if response has a JSON routine block
      let parsedPlan: Message["plan"] = undefined;
      const jsonMatch = replyText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.assignments && Array.isArray(parsed.assignments)) {
            parsedPlan = {
              summary: parsed.summary,
              assignments: parsed.assignments,
            };
          }
        } catch {
          // not JSON, keep text
        }
      }

      const cleanText = replyText.replace(/```(?:json)?\s*[\s\S]*?\s*```/g, "").trim();

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: cleanText || replyText,
        plan: parsedPlan,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // Apply Gemini Proposed Plan directly into Schedule
  function handleApplyPlan(plan: NonNullable<Message["plan"]>) {
    const gridAssignments: GridAssignment[] = [];

    // Map batch names to IDs
    plan.assignments.forEach((item) => {
      let batch = state.batches.find(
        (b) => b.name.toLowerCase() === item.batchName.toLowerCase().trim(),
      );
      const batchId = batch?.id || `b_${item.batchName.replace(/\s+/g, "_")}`;
      const teacher = state.teachers.find(
        (t) => t.name.toLowerCase() === item.teacherName.toLowerCase().trim(),
      );

      gridAssignments.push({
        batchId,
        batchName: item.batchName,
        sessionIndex: item.sessionIndex,
        sessionId: `s${item.sessionIndex + 1}`,
        teacherId: teacher?.id || null,
        teacherName: teacher?.name || item.teacherName,
      });
    });

    const maxSession = plan.assignments.reduce(
      (max, a) => Math.max(max, a.sessionIndex + 1),
      5,
    );

    const updatedDay = applyGeneratedGridToDay({
      day,
      assignments: gridAssignments,
      sessionCount: maxSession,
    });

    // Ensure batches exist in state
    const currentBatches = [...state.batches];
    plan.assignments.forEach((item) => {
      if (!currentBatches.some((b) => b.name.toLowerCase() === item.batchName.toLowerCase())) {
        currentBatches.push({
          id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name: item.batchName,
          roster: [],
        });
      }
    });

    dispatch({
      type: "replace",
      state: {
        ...state,
        batches: currentBatches,
        days: state.days.map((d) => (d.id === day.id ? updatedDay : d)),
      },
    });

    Alert.alert(
      "AI Routine Applied!",
      `Gemini's plan was successfully written into Day ${day.dayNumber} routine. Module codes can be chosen in the routine editor.`,
      [
        { text: "Done" },
        {
          text: "View Routine",
          onPress: () => router.push("/(main)/routine"),
        },
      ],
    );
  }

  return (
    <View style={{ gap: space.md }}>
      {/* API Key Configuration Banner */}
      <View style={[card, { padding: space.md }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="sparkles" size={18} color={colors.accent} />
            <T weight="bold" style={{ fontSize: 13, color: colors.ink }}>
              Gemini Free API Key
            </T>
            {apiKey ? (
              <View style={keyBadge}>
                <T style={{ fontSize: 10, color: colors.accentDark }}>Active ✓</T>
              </View>
            ) : (
              <View style={[keyBadge, { backgroundColor: colors.warnBg }]}>
                <T style={{ fontSize: 10, color: colors.warn }}>Required</T>
              </View>
            )}
          </View>
          <Pressable hitSlop={8} onPress={() => setShowKeyConfig(!showKeyConfig)}>
            <T weight="semibold" style={{ color: colors.accent, fontSize: 12 }}>
              {showKeyConfig ? "Hide" : apiKey ? "Change" : "Configure"}
            </T>
          </Pressable>
        </View>

        {showKeyConfig && (
          <View style={{ marginTop: space.sm, gap: 8 }}>
            <T style={{ color: colors.muted, fontSize: 12 }}>
              Using free tier Gemini API. Get a key at{" "}
              <T weight="semibold" style={{ color: colors.accent }}>
                aistudio.google.com/app/apikey
              </T>{" "}
              (free, no credit card required).
            </T>
            <Field
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="Paste AI Studio Gemini Key (AIzaSy...)"
              autoCapitalize="none"
              secureTextEntry
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Button label="Save Key" tone="primary" small onPress={handleSaveKey} />
            </View>
          </View>
        )}
        {keySaved && <T style={{ color: colors.accent, fontSize: 11, marginTop: 4 }}>Key saved successfully ✓</T>}
      </View>

      {/* Main Voice Assistant Card */}
      <View style={card}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={iconCircle}>
              <Ionicons name="mic" size={20} color={colors.accent} />
            </View>
            <View>
              <T weight="bold" style={{ fontSize: 15, color: colors.ink }}>
                Voice Routine Assistant
              </T>
              <T style={{ color: colors.muted, fontSize: 11 }}>
                Speak in Bangla or English — Gemini will plan the routine
              </T>
            </View>
          </View>

          {/* Language Switcher */}
          <View style={{ width: 140 }}>
            <Segmented
              label="Language"
              value={lang}
              onChange={(val) => setLang(val as "bn-BD" | "en-US")}
              options={[
                { value: "bn-BD", label: "বাংলা" },
                { value: "en-US", label: "English" },
              ]}
            />
          </View>
        </View>

        {/* Conversation List */}
        <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.sm, paddingVertical: space.xs }}>
            {messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  chatBubble,
                  msg.role === "user" ? chatBubbleUser : chatBubbleAssistant,
                ]}
              >
                <T
                  style={{
                    fontSize: 13,
                    color: msg.role === "user" ? "#fff" : colors.ink,
                    lineHeight: 18,
                  }}
                >
                  {msg.text}
                </T>

                {/* Proposed Plan Box if AI generated a routine */}
                {msg.plan && (
                  <View style={planCard}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="sparkles" size={16} color={colors.accent} />
                      <T weight="bold" style={{ fontSize: 13, color: colors.accentDark }}>
                        AI Generated Routine Plan
                      </T>
                    </View>
                    {msg.plan.summary ? (
                      <T style={{ fontSize: 12, color: colors.ink }}>{msg.plan.summary}</T>
                    ) : null}

                    {/* Preview table */}
                    <View style={{ maxHeight: 140 }}>
                      <ScrollView nestedScrollEnabled>
                        <View style={{ gap: 4 }}>
                          {msg.plan.assignments.map((item, idx) => (
                            <View key={idx} style={planRow}>
                              <T weight="semibold" style={{ fontSize: 11, color: colors.ink, width: 70 }}>
                                {item.batchName}
                              </T>
                              <T style={{ fontSize: 11, color: colors.muted, width: 65 }}>
                                Session {item.sessionIndex + 1}
                              </T>
                              <T weight="medium" style={{ fontSize: 11, color: colors.accentDark, flex: 1 }}>
                                {item.teacherName}
                              </T>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>

                    <Button
                      tone="primary"
                      small
                      label="✨ Apply AI Plan to Routine"
                      onPress={() => handleApplyPlan(msg.plan!)}
                    />
                  </View>
                )}
              </View>
            ))}

            {busy && (
              <View style={[chatBubble, chatBubbleAssistant, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
                <ActivityIndicator size="small" color={colors.accent} />
                <T style={{ color: colors.muted, fontSize: 12 }}>Gemini is planning your routine…</T>
              </View>
            )}
          </View>
        </ScrollView>

        {error && <T style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</T>}

        {/* Voice Microphone Control & Text Input */}
        <View style={{ marginTop: space.sm, gap: space.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* Mic Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isListening ? "Stop listening" : "Start speaking"}
              onPress={toggleListening}
              style={[
                micButton,
                isListening && micButtonActive,
              ]}
            >
              <Ionicons
                name={isListening ? "stop" : "mic"}
                size={22}
                color={isListening ? "#fff" : colors.accent}
              />
            </Pressable>

            {/* Live Text Field */}
            <View style={{ flex: 1 }}>
              <Field
                value={transcript}
                onChangeText={setTranscript}
                placeholder={
                  isListening
                    ? lang === "bn-BD"
                      ? "শুনছি... বলুন..."
                      : "Listening... speak now..."
                    : lang === "bn-BD"
                      ? "মুখে বলুন অথবা এখানে লিখুন..."
                      : "Speak or type your routine instructions..."
                }
              />
            </View>

            {/* Send Button */}
            <Button
              tone="primary"
              disabled={busy || !transcript.trim()}
              label="Send"
              onPress={() => handleSend()}
            />
          </View>

          {isListening && (
            <T style={{ color: colors.accent, fontSize: 11, fontStyle: "italic", marginLeft: 4 }}>
              🎙️ Listening in {lang === "bn-BD" ? "বাংলা (Bangla)" : "English"}... Tap square to stop.
            </T>
          )}

          {/* Quick Prompt Suggestions */}
          <View style={{ marginTop: space.xs }}>
            <T style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>
              Quick prompts (ক্লিক করে পরীক্ষা করুন):
            </T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable
                  style={promptChip}
                  onPress={() =>
                    handleSend(
                      "আজকের ৫টি ব্যাচের জন্য রুটিন বানিয়ে দাও। শিক্ষক হিসেবে লিটন স্যার, নূরুজ্জামান স্যার, রহমান স্যার, আরিফুল স্যার ও সাজ্জাদ স্যার আছেন।",
                    )
                  }
                >
                  <T style={{ fontSize: 11, color: colors.ink }}>
                    🇧🇩 ৫টি ব্যাচে ৫ জন শিক্ষকের রুটিন বানাও
                  </T>
                </Pressable>

                <Pressable
                  style={promptChip}
                  onPress={() =>
                    handleSend(
                      "Generate a 5-batch routine. Dr. Litan is busy in session 2, Dr. Rahman in session 4. Please avoid conflicts.",
                    )
                  }
                >
                  <T style={{ fontSize: 11, color: colors.ink }}>
                    🇬🇧 5 batches with teacher busy times
                  </T>
                </Pressable>

                <Pressable
                  style={promptChip}
                  onPress={() =>
                    handleSend(
                      "আমাদের ৫টি ব্যাচের জন্য কতজন শিক্ষক লাগবে এবং ক্লাস কিভাবে ভাগ করা উচিত?",
                    )
                  }
                >
                  <T style={{ fontSize: 11, color: colors.ink }}>
                    💬 ৫ ব্যাচের জন্য কয়জন শিক্ষক দরকার?
                  </T>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
}

const iconCircle = {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.accentSoft,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const keyBadge = {
  backgroundColor: colors.accentSoft,
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: radius.pill,
};

const chatBubble = {
  padding: 10,
  borderRadius: radius.md,
  maxWidth: "92%" as const,
};

const chatBubbleUser = {
  alignSelf: "flex-end" as const,
  backgroundColor: colors.accent,
  borderBottomRightRadius: 2,
};

const chatBubbleAssistant = {
  alignSelf: "flex-start" as const,
  backgroundColor: colors.paper,
  borderWidth: 1,
  borderColor: colors.line,
  borderBottomLeftRadius: 2,
};

const planCard = {
  marginTop: 8,
  backgroundColor: colors.surface,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.accent,
  padding: 8,
  gap: 6,
};

const planRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  paddingVertical: 3,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
};

const micButton = {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: colors.accentSoft,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  borderWidth: 1,
  borderColor: colors.accent,
};

const micButtonActive = {
  backgroundColor: colors.danger,
  borderColor: colors.danger,
};

const promptChip = {
  backgroundColor: colors.paper,
  borderRadius: radius.pill,
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderWidth: 1,
  borderColor: colors.line,
};
