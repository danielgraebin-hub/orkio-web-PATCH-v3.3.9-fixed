
/**
 * ORKIO — SUMMIT ONBOARDING MODAL (FINAL PATCH)
 * Includes:
 * - country
 * - language
 * - whatsapp
 * - improved contrast
 * Compatible with /api/user/onboarding
 */

import React, { useMemo, useState } from "react";
import { getTenant, getToken } from "../lib/auth.js";

const USER_TYPES = [
  { value: "founder", label: "Founder" },
  { value: "investor", label: "Investor" },
  { value: "operator", label: "Operator" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
];

const INTENTS = [
  { value: "explore", label: "Explorar a plataforma" },
  { value: "meeting", label: "Agendar conversa" },
  { value: "pilot", label: "Avaliar piloto" },
  { value: "funding", label: "Discutir investimento" },
  { value: "other", label: "Outro" },
];

const COUNTRIES = [
  { value: "BR", label: "Brasil" },
  { value: "US", label: "Estados Unidos" },
  { value: "PT", label: "Portugal" },
  { value: "ES", label: "Espanha" },
  { value: "OTHER", label: "Outro" },
];

const LANGUAGES = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
];

export default function OnboardingModal({ user, onComplete }) {

  const [form, setForm] = useState({
    company: user?.company || "",
    role: user?.profile_role || "",
    user_type: user?.user_type || "",
    intent: user?.intent || "",
    country: user?.country || "",
    language: user?.language || "",
    whatsapp: user?.whatsapp || "",
    notes: user?.notes || "",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fullName = useMemo(() => (user?.name || "").trim(), [user]);

  function setField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();

    if (!form.user_type || !form.intent || !form.country || !form.language) {
      setError("Preencha perfil, objetivo, país e idioma.");
      return;
    }

    const payload = {
      ...form,
      onboarding_completed: true
    };

    setBusy(true);
    setError("");

    try {
      const token = getToken();
      const org = getTenant();

      const res = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "X-Org-Slug": org
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Erro ao salvar onboarding");

      const data = await res.json();

      onComplete?.(data?.user || payload);

    } catch (err) {
      setError(err?.message || "Erro ao salvar onboarding");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "#070b18",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>

      <form onSubmit={handleSubmit}
        style={{
          background: "#0f172a",
          padding: 32,
          borderRadius: 20,
          width: 640,
          color: "white"
        }}>

        <h2>Welcome to Orkio Summit</h2>

        <input placeholder="Company"
          value={form.company}
          onChange={e => setField("company", e.target.value)} />

        <input placeholder="Role"
          value={form.role}
          onChange={e => setField("role", e.target.value)} />

        <select
          value={form.user_type}
          onChange={e => setField("user_type", e.target.value)}>

          <option value="">User type</option>

          {USER_TYPES.map(opt =>
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )}
        </select>

        <select
          value={form.intent}
          onChange={e => setField("intent", e.target.value)}>

          <option value="">Main interest</option>

          {INTENTS.map(opt =>
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )}
        </select>

        <select
          value={form.country}
          onChange={e => setField("country", e.target.value)}>

          <option value="">Country</option>

          {COUNTRIES.map(opt =>
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )}
        </select>

        <select
          value={form.language}
          onChange={e => setField("language", e.target.value)}>

          <option value="">Language</option>

          {LANGUAGES.map(opt =>
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )}
        </select>

        <input placeholder="WhatsApp"
          value={form.whatsapp}
          onChange={e => setField("whatsapp", e.target.value)} />

        <textarea placeholder="Notes"
          value={form.notes}
          onChange={e => setField("notes", e.target.value)} />

        {error && <div>{error}</div>}

        <button disabled={busy}>
          Continue to Orkio
        </button>

      </form>
    </div>
  )
}
