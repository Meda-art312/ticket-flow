# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-specified React, Vite, strict TypeScript, React Router, TanStack Query, CSS, npm and Dockerized Playwright.

## Users

Visitors discover events. Customers reserve, pay through local simulation or Stripe test checkout, retrieve tickets and request refunds. Organizers manage their own events and admit ticket holders. Organizers can also buy tickets.

## Product Purpose

A small working browser application for testing TicketFlow journeys against its actual independent backend. Success means finishing customer and organizer tasks without API tools.

## Operating Context

Backend-owned ticketflow-api-v1 contract. Browser at localhost:8080, same-origin /api/v1 proxy. Docker builds and checks. Desktop and approximately 375px mobile widths. No frontend financial or inventory authority.

## Capabilities and Constraints

frontend-srs.md version 2.0 and the user's attached build request define scope. Preserve backend source; no general admin console, chart system, mandatory camera scanner or marketing site. No embedded passwords or persistent bearer tokens. Backend states and permitted actions are authoritative.

## Brand Commitments

TicketFlow. User chose the proposed editorial event guide after reconsidering a dark club direction, and explicitly requested that it not be too bright. Modern, distinctive, no generic generated template.

## Evidence on Hand

Real API contract snapshot in docs/ticketflow-api-v1.openapi.json; sibling backend integration notes, local seed fixtures and running API/worker. No event photography or promotional claims supplied. Decorative event artwork must not imply actual venue photography.

## Product Principles

- Make each next action easy to find.
- Keep payment, booking, refund and ticket outcomes truthful and separate.
- Preserve recovery paths and command identities.
- Let event content carry personality; keep transactional screens clear.

## Accessibility & Inclusion

Labeled forms, keyboard focus, accessible dialogs and announcements, reduced motion, readable contrast and responsive mobile/desktop layouts required by the SRS.
