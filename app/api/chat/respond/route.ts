import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AGENTS, type Agent } from "@/lib/agents";

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "stepfun-ai/step-3.7-flash";

function buildConversation(messages: any[]): string {
  return messages
    .slice(-25)
    .map((m) => {
      const sender = m.name || "Unknown";
      return `${sender}: ${m.content}`;
    })
    .join("\n");
}

const ORCHESTRATOR_SYSTEM = `You orchestrate an executive group chat. Your job: decide which team members would naturally respond to the latest message, and generate their responses.

Rules:
- Only make team members speak who have something relevant to add based on their role.
- If a topic is clearly about one domain, only that expert should respond.
- Responses must be SHORT: 1-3 sentences. This is a group chat, not a memo.
- Each response must sound like a real human in a work chat. Natural, casual, professional.
- Never use bullet points, lists, or formatting. Plain text only.
- Responses can react to what others said, agree, disagree, build on ideas.
- The CEO is the human user who started the conversation.
- Output as JSON: {"responses":[{"agent_id":"agent-xxx","content":"..."}]}
- If no one should respond, output: {"responses":[]}
- agent_id must be one of the valid agent IDs.`;

export async function POST(req: NextRequest) {
  if (!NVIDIA_API_KEY) {
    return NextResponse.json({ error: "NVIDIA_API_KEY not configured" }, { status: 500 });
  }

  try {
    const { groupId, messageId } = await req.json();
    if (!groupId || !messageId) {
      return NextResponse.json({ error: "groupId and messageId required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: triggerMsg } = await supabase
      .from("messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (!triggerMsg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (triggerMsg.user_id?.startsWith("agent-")) {
      return NextResponse.json({ skipped: true, reason: "agent message" });
    }

    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);

    if (!members || members.length === 0) {
      return NextResponse.json({ skipped: true, reason: "no members" });
    }

    const agentMembers = members.filter((m: any) =>
      m.user_id.startsWith("agent-")
    );

    if (agentMembers.length === 0) {
      return NextResponse.json({ skipped: true, reason: "no agents in group" });
    }

    const { data: recentMessages } = await supabase
      .from("messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(30);

    const allMessages = recentMessages || [];
    const conversation = buildConversation(allMessages);

    // Build the team roster for the AI
    const teamRoster = agentMembers
      .map((m: any) => {
        const agent = AGENTS.find((a) => a.id === m.user_id);
        if (!agent) return null;
        return `- ${agent.emoji} ${agent.name} (ID: ${agent.id}) — ${agent.role}`;
      })
      .filter(Boolean)
      .join("\n");

    const orchestratorPrompt = `You are orchestrating a work group chat. The CEO just sent a message.

Team members available:
${teamRoster}

Recent conversation:
${conversation}

Which team members would naturally respond to this? Output JSON only.`;

    // Single orchestrator call — one model decides everything
    const nvidiaRes = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          { role: "system", content: ORCHESTRATOR_SYSTEM },
          { role: "system", content: AGENTS.map((a) => `${a.emoji} ${a.name} (${a.id}) — ${a.role}\nPersonality: ${a.systemPrompt.split("\n").slice(1, 4).join(" ")}`).join("\n\n") },
          { role: "user", content: orchestratorPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.7,
        top_p: 0.95,
      }),
    });

    if (!nvidiaRes.ok) {
      const errText = await nvidiaRes.text();
      console.error("NVIDIA API error:", nvidiaRes.status, errText);
      return NextResponse.json({ error: "NVIDIA API error" }, { status: 502 });
    }

    const nvidiaData = await nvidiaRes.json();
    const rawContent = nvidiaData.choices?.[0]?.message?.content?.trim();

    if (!rawContent) {
      return NextResponse.json({ skipped: true, reason: "empty response" });
    }

    // Parse JSON from response
    let parsed: { responses: { agent_id: string; content: string }[] };
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
    } catch {
      console.warn("Failed to parse NVIDIA response as JSON:", rawContent);
      return NextResponse.json({ skipped: true, reason: "parse failed" });
    }

    if (!parsed.responses || parsed.responses.length === 0) {
      return NextResponse.json({ skipped: true, reason: "no agents responded" });
    }

    // Validate agent IDs and content
    const validResponses = parsed.responses.filter((r) => {
      const agent = AGENTS.find((a) => a.id === r.agent_id);
      return agent && r.content && r.content.length > 5;
    });

    if (validResponses.length === 0) {
      return NextResponse.json({ skipped: true, reason: "no valid responses" });
    }

    // Insert responses with staggered delays for natural feel
    const result = [];
    for (let i = 0; i < validResponses.length; i++) {
      const r = validResponses[i];
      const agent = AGENTS.find((a) => a.id === r.agent_id)!;

      // Stagger: each agent responds with a delay (sent as separate timestamps)
      const insertedAt = new Date(Date.now() + i * 2000).toISOString();

      await supabase.from("messages").insert({
        group_id: groupId,
        user_id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        content: r.content,
        type: "text",
        created_at: insertedAt,
      });

      result.push({ name: agent.name, role: agent.role, content: r.content });
    }

    return NextResponse.json({ success: true, responses: result });
  } catch (error: any) {
    console.error("AI response error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
