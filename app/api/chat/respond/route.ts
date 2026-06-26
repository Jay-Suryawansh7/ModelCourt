import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AGENTS, type Agent } from "@/lib/agents";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_CORE = `You are part of an executive team in a group chat with your CEO.
Rules you MUST follow:
- Keep responses VERY short. 1-3 sentences max. This is a group chat, not a memo.
- Write like a real human in a work group chat. Natural, casual, but professional.
- Never introduce yourself. Never say "As the [role]..." Just answer.
- Read the conversation history and respond naturally to what's being discussed.
- Only chime in when you have something relevant to say. If you have nothing useful to add, stay quiet.
- React to others' messages naturally — agree, disagree, build on ideas.
- No bullet points. No numbered lists. No formatting. Plain text only.
- Use occasional casual language: "yeah", "got it", "makes sense", "fair point", "hmm".
- Be concise. A single sentence is often enough.`;

function buildContext(messages: any[], agent: Agent): string {
  const history = messages
    .slice(-20)
    .map((m) => {
      const sender = m.name || "Unknown";
      const isAgent = m.user_id?.startsWith("agent-");
      if (isAgent && m.user_id === agent.id) return null;
      return `${sender}: ${m.content}`;
    })
    .filter(Boolean)
    .join("\n");

  return `Recent conversation:\n${history}\n\n${agent.name} (${agent.role}), your turn. Respond naturally in the group chat. Keep it short.`;
}

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const { groupId, messageId } = await req.json();
    if (!groupId || !messageId) {
      return NextResponse.json({ error: "groupId and messageId required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch the triggering message
    const { data: triggerMsg } = await supabase
      .from("messages")
      .select("*")
      .eq("id", messageId)
      .single();

    if (!triggerMsg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Only trigger AI responses for human messages
    if (triggerMsg.user_id?.startsWith("agent-")) {
      return NextResponse.json({ skipped: true, reason: "agent message" });
    }

    // Get group members to find which agents are in this group
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

    // Fetch recent message history
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(30);

    const allMessages = recentMessages || [];

    // Decide which agents respond (not all respond every time)
    const agentsToRespond = agentMembers.filter(() => Math.random() < 0.7);

    if (agentsToRespond.length === 0) {
      return NextResponse.json({ skipped: true, reason: "no agents decided to respond" });
    }

    const responses: { agent: Agent; content: string }[] = [];

    for (const member of agentsToRespond) {
      const agent = AGENTS.find((a) => a.id === member.user_id);
      if (!agent) continue;

      const context = buildContext(allMessages, agent);

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_CORE },
            { role: "system", content: agent.systemPrompt },
            { role: "user", content: context },
          ],
          max_tokens: 150,
          temperature: 0.8,
        }),
      });

      if (!openaiRes.ok) continue;

      const data = await openaiRes.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) continue;

      responses.push({ agent, content });
    }

    // Insert AI responses into Supabase
    for (const { agent, content } of responses) {
      await supabase.from("messages").insert({
        group_id: groupId,
        user_id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        content,
        type: "text",
      });
    }

    return NextResponse.json({
      success: true,
      responses: responses.map((r) => ({
        name: r.agent.name,
        role: r.agent.role,
        content: r.content,
      })),
    });
  } catch (error: any) {
    console.error("AI response error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
