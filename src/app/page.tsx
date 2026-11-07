"use client";

import { FormEvent, useEffect, useState } from "react";

type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("Loading projects...");

  useEffect(() => {
    fetch("/api/projects")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load projects.");
        const result = (await response.json()) as { projects: Project[] };
        setProjects(result.projects);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Saving...");

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });

    const result = (await response.json()) as
      | { project: Project }
      | { error: string };
    if (!response.ok || !("project" in result)) {
      setMessage("error" in result ? result.error : "Could not save project.");
      return;
    }

    setProjects((current) => [result.project, ...current]);
    setName("");
    setDescription("");
    setMessage("Project saved.");
  }

  return (
    <main>
      <p className="eyebrow">HackUTD project workspace</p>
      <h1>Build for NVIDIA + CBRE</h1>
      <p className="intro">
        A small full-stack foundation with a Next.js frontend, API routes, and
        Supabase persistence.
      </p>

      <section className="card">
        <h2>Create a project</h2>
        <form onSubmit={createProject}>
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Smart building intelligence"
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What are we building?"
              rows={3}
            />
          </label>
          <button type="submit">Save project</button>
        </form>
        {message && <p className="status">{message}</p>}
      </section>

      <section>
        <h2>Projects</h2>
        {projects.length === 0 && !message ? (
          <p className="muted">No projects yet.</p>
        ) : (
          <ul className="projects">
            {projects.map((project) => (
              <li className="card" key={project.id}>
                <h3>{project.name}</h3>
                <p>{project.description || "No description yet."}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
