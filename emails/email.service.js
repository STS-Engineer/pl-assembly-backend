const fs = require('fs')
const path = require('path')
const nodemailer = require('nodemailer')
const notificationService = require('../services/notification.service')

const BRAND_LOGO_CID = 'pl-assembly-brand-logo'
const brandLogoPath = path.join(__dirname, '..', '..', 'frontend', 'public', 'img', 'logo.PNG')

function normalizeBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'string') {
    return defaultValue
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return defaultValue
}

function normalizeBaseUrl(value) {
  return String(value || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '')
}

function getTransporter() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const secure = normalizeBoolean(process.env.SMTP_SECURE, port === 465)
  const rejectUnauthorized = normalizeBoolean(process.env.SMTP_TLS_REJECT_UNAUTHORIZED, false)

  if (!host) {
    throw new Error('SMTP_HOST is required to send emails.')
  }

  const transportConfig = {
    host,
    port,
    secure,
    tls: {
      rejectUnauthorized,
    },
  }

  if (process.env.SMTP_USER || process.env.SMTP_PASS) {
    transportConfig.auth = {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    }
  }

  return nodemailer.createTransport(transportConfig)
}

function getFromEmail() {
  return process.env.SMTP_FROM || process.env.SMTP_USER
}

function getAdminEmail() {
  return process.env.ADMIN_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER
}

function normalizeRecipients(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeRecipients(entry))
  }

  if (!value) {
    return []
  }

  return String(value)
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function resolveAdminRecipients(adminEmails = []) {
  const recipients = [...normalizeRecipients(adminEmails), ...normalizeRecipients(getAdminEmail())]
  return [...new Set(recipients.map((recipient) => String(recipient || '').trim().toLowerCase()).filter(Boolean))]
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getDisplayValue(value, fallback = 'N/A') {
  const normalizedValue = String(value ?? '').trim()
  return normalizedValue || fallback
}

function buildNotificationSummary(parts = []) {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' | ')
}

function getOptionalText(value) {
  const normalizedValue = String(value ?? '').trim()
  return normalizedValue || null
}

function normalizeProjectContext(projectContext) {
  const normalizedProjectContext =
    projectContext && typeof projectContext === 'object'
      ? projectContext
      : { rfq_id: projectContext }

  return {
    rfq_id: getOptionalText(normalizedProjectContext.rfq_id ?? normalizedProjectContext.rfqId),
    project_display_name: getDisplayValue(
      normalizedProjectContext.project_display_name ??
        normalizedProjectContext.projectDisplayName ??
        normalizedProjectContext.reference ??
        normalizedProjectContext.rfq_id ??
        normalizedProjectContext.rfqId,
    ),
  }
}

function getWorkspaceCostingUrl() {
  return `${normalizeBaseUrl(process.env.FRONTEND_URL || process.env.BACKEND_URL)}/workspace/costing`
}

async function sendMail({ to, subject, text, html, attachments = [] }) {
  const from = getFromEmail()

  if (!from) {
    throw new Error('SMTP_FROM or SMTP_USER is required to send emails.')
  }

  if (!to) {
    throw new Error('Recipient email is required.')
  }

  const transporter = getTransporter()

  return transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments,
  })
}

async function sendMailWithNotification({
  to,
  subject,
  text,
  html,
  attachments = [],
  notification = null,
  notificationRecipients = null,
}) {
  const emailResponse = await sendMail({
    to,
    subject,
    text,
    html,
    attachments,
  })

  if (notification) {
    try {
      await notificationService.createNotificationsForRecipients(
        notificationRecipients || to,
        notification,
      )
    } catch (error) {
      console.error('Unable to create frontend notifications for email recipients:', error.message)
    }
  }

  return emailResponse
}

function getBrandLogoAttachment() {
  if (!fs.existsSync(brandLogoPath)) {
    return []
  }

  return [
    {
      filename: 'logo.PNG',
      path: brandLogoPath,
      cid: BRAND_LOGO_CID,
    },
  ]
}

function renderEmailShell({ eyebrow, title, intro, contentHtml, actionLabel, actionUrl, footerNote }) {
  const logoHtml = fs.existsSync(brandLogoPath)
    ? `
        <div style="display:grid;place-items:center;width:92px;min-width:92px;padding:8px;margin-right:8px;margin-bottom:8px;border-radius:16px;background:rgba(255,255,255,0.96);box-shadow:0 16px 34px rgba(8,31,49,0.12);">
          <img src="cid:${BRAND_LOGO_CID}" alt="PL Assembly" style="display:block;width:100%;height:auto;" />
        </div>
      `
    : `
        <div style="display:grid;place-items:center;width:92px;min-width:92px;margin-right:8px;margin-bottom:8px;border-radius:16px;background:rgba(255,255,255,0.96);box-shadow:0 16px 34px rgba(8,31,49,0.12);font-family:'Trebuchet MS','Segoe UI',Calibri,Arial,sans-serif;font-weight:700;color:#081e2f;">
          PL
        </div>
      `

  const actionHtml = actionLabel && actionUrl
    ? `
        <div style="margin-top:28px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="260" style="border-collapse:separate !important;">
            <tr>
              <td
                align="center"
                valign="middle"
                width="260"
                height="52"
                bgcolor="#ef7807"
                style="width:260px;height:52px;background:#ef7807 !important;background-color:#ef7807 !important;border:1px solid #ef7807;border-radius:26px;mso-padding-alt:0;"
              >
                <a
                  href="${escapeHtml(actionUrl)}"
                  target="_blank"
                  style="display:block;width:260px;height:52px;line-height:52px;border-radius:26px;background:#ef7807 !important;background-color:#ef7807 !important;color:#ffffff !important;text-align:center;text-decoration:none;font-family:'Segoe UI',Calibri,'Trebuchet MS',Arial,sans-serif;font-size:15px;font-weight:800;-webkit-text-size-adjust:none;"
                >
                  <font color="#ffffff">${escapeHtml(actionLabel)}</font>
                </a>
              </td>
            </tr>
          </table>
        </div>
      `
    : ''

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
      </head>
      <body style="margin:0;padding:0;background:
        radial-gradient(circle at top left, rgba(4,110,175,0.08), transparent 26%),
        radial-gradient(circle at bottom right, rgba(239,120,7,0.10), transparent 24%),
        linear-gradient(180deg, #f8f4ee 0%, #f3ede5 100%);
        color:#162231;
        font-family:'Segoe UI',Calibri,'Trebuchet MS',Arial,sans-serif;"
      >
        <div style="padding:32px 16px;">
          <div style="max-width:600px;margin:0 auto;">
            <div style="border-radius:28px;background:rgba(255,255,255,0.96);border:1px solid rgba(14,78,120,0.08);box-shadow:0 18px 44px rgba(8,31,49,0.10);padding:30px;">
              <div style="display:flex;flex-direction:column;gap:12px;align-items:flex-start;">
                <div style="display:flex;align-items:center;gap:14px;">
                  ${logoHtml}
                  <div style="display:flex;flex-direction:column;gap:2px;text-align:left;">
                    <span style="font-family:'Trebuchet MS','Segoe UI',Calibri,Arial,sans-serif;font-size:1.2rem;font-weight:700;line-height:1.1;color:#081e2f;">PL Assembly</span>
                    <span style="max-width:260px;font-size:0.92rem;line-height:1.4;color:#53697b;">Workflow access & validations</span>
                  </div>
                </div>

                <span style="display:inline-flex;width:fit-content;padding:8px 12px;border-radius:999px;background:rgba(14,78,120,0.10);color:#0e4e78;text-transform:uppercase;letter-spacing:0.12em;font-size:0.76rem;font-weight:800;">
                  ${eyebrow}
                </span>

                <h1 style="margin:0;font-family:'Trebuchet MS','Segoe UI',Calibri,Arial,sans-serif;font-size:2rem;font-weight:700;line-height:1.12;letter-spacing:-0.03em;color:#081e2f;">
                  ${title}
                </h1>

                <p style="margin:0;font-size:1rem;line-height:1.6;color:#53697b;">
                  ${intro}
                </p>
              </div>

              <div style="margin-top:22px;">
                ${contentHtml}
                ${actionHtml}
              </div>

              ${footerNote ? `<div style="margin-top:22px;padding-top:18px;border-top:1px solid rgba(14,78,120,0.12);font-size:0.95rem;line-height:1.6;color:#53697b;">
                ${footerNote}
              </div>` : ''}
            </div>
          </div>
        </div>
      </body>
    </html>
  `
}

function renderDetailRow(label, value) {
  return `
    <tr>
      <td style="padding:0 0 12px 0;font-size:0.95rem;font-weight:700;color:#0a3452;vertical-align:top;width:112px;">${escapeHtml(label)}</td>
      <td style="padding:0 0 12px 0;font-size:0.98rem;color:#162231;">${escapeHtml(value)}</td>
    </tr>
  `
}

function getPasswordResetUrl(resetToken) {
  const encodedToken = encodeURIComponent(resetToken)

  if (process.env.FRONTEND_URL) {
    return `${normalizeBaseUrl(process.env.FRONTEND_URL)}/reset-password/${encodedToken}`
  }

  return `${normalizeBaseUrl(process.env.BACKEND_URL)}/api/users/reset-password/${encodedToken}`
}

async function sendAdminApprovalRequest(user, approvalToken) {
  const recipients = resolveAdminRecipients(user.adminEmails)
  const notificationRecipients =
    Array.isArray(user.adminNotificationRecipients) && user.adminNotificationRecipients.length > 0
      ? user.adminNotificationRecipients
      : recipients
  const approvalUrl = `${normalizeBaseUrl(process.env.BACKEND_URL)}/api/users/approve-account/${encodeURIComponent(approvalToken)}`
  const fullName = user.full_name || 'Unknown user'
  const email = user.email || 'No email provided'
  const intro =
    'A user has created an account in PL Assembly and needs an administrator approval before sign in is allowed.'
  const notificationMessage = buildNotificationSummary([fullName, email])
  const text = [
    'A new user account is waiting for approval.',
    '',
    `Name: ${fullName}`,
    `Email: ${email}`,
    '',
    `Approve this account: ${approvalUrl}`,
  ].join('\n')

  if (recipients.length === 0) {
    throw new Error('At least one admin recipient is required to notify the administrator.')
  }

  const html = renderEmailShell({
    eyebrow: 'Account approval',
    title: 'A new account is waiting for validation',
    intro,
    contentHtml: `
      <div style="border-radius:20px;background:#fbf8f4;border:1px solid rgba(14,78,120,0.14);padding:18px 18px 6px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${renderDetailRow('Full name', fullName)}
          ${renderDetailRow('Email', email)}
        </table>
      </div>
      <p style="margin:18px 0 0;font-size:0.96rem;line-height:1.6;color:#53697b;">
        Once this account is approved, the user will receive a confirmation email and will be able to sign in.
      </p>
    `,
    actionLabel: 'Approve this account',
    actionUrl: approvalUrl,
    footerNote: `
      If the button does not work, copy this link into your browser:<br />
      <a href="${approvalUrl}" style="color:#ef7807;text-decoration:none;font-weight:700;">${approvalUrl}</a>
    `,
  })

  return sendMailWithNotification({
    to: recipients.join(', '),
    subject: 'New account pending approval',
    text,
    html,
    attachments: getBrandLogoAttachment(),
    notificationRecipients,
    notification: {
      type: 'admin-approval-request',
      subject: 'New account pending approval',
      title: 'A new account is waiting for validation',
      message: notificationMessage || intro,
      body: null,
      action_label: 'Approve this account',
      action_url: approvalUrl,
      metadata: {
        full_name: fullName,
        email,
      },
    },
  })
}

async function sendUserApprovalConfirmation(user) {
  const fullName = user.full_name || 'User'
  const signInUrl = process.env.FRONTEND_URL ? `${normalizeBaseUrl(process.env.FRONTEND_URL)}/` : ''
  const intro = 'Good news. Your PL Assembly access has been validated by an administrator.'
  const notificationMessage = 'You can now sign in.'
  const text = [
    `Hello ${fullName},`,
    '',
    'Your account has been approved.',
    'You can now sign in.',
  ].join('\n')

  const html = renderEmailShell({
    eyebrow: 'Account approved',
    title: 'Your account has been approved',
    intro,
    contentHtml: `
      <div style="border-radius:20px;background:#eaf7ef;border:1px solid rgba(29,93,54,0.16);padding:18px;">
        <p style="margin:0;font-size:1rem;line-height:1.6;color:#1d5d36;">
          Hello <strong>${escapeHtml(fullName)}</strong>, your account has been approved. You can now sign in.
        </p>
      </div>
    `,
    actionLabel: signInUrl ? 'Go to sign in' : '',
    actionUrl: signInUrl,
    footerNote: 'If you did not request this account, please contact your administrator.',
  })

  return sendMailWithNotification({
    to: user.email,
    subject: 'Your account has been approved',
    text,
    html,
    attachments: getBrandLogoAttachment(),
    notification: {
      type: 'user-approval-confirmation',
      subject: 'Your account has been approved',
      title: 'Your account has been approved',
      message: notificationMessage,
      body: null,
      action_label: signInUrl ? 'Go to sign in' : '',
      action_url: signInUrl,
    },
  })
}

async function sendUserPasswordResetEmail(user, resetToken) {
  const fullName = user.full_name || 'User'
  const resetUrl = getPasswordResetUrl(resetToken)
  const intro = 'We received a request to reset your PL Assembly password.'
  const notificationMessage = 'Use the button below to choose a new password.'
  const text = [
    `Hello ${fullName},`,
    '',
    intro,
    'Use the link below to create a new password:',
    resetUrl,
    '',
    'If you did not request a password reset, you can ignore this email.',
  ].join('\n')

  const html = renderEmailShell({
    eyebrow: 'Password reset',
    title: 'Reset your password',
    intro,
    contentHtml: `
      <div style="border-radius:20px;background:#fbf8f4;border:1px solid rgba(14,78,120,0.14);padding:18px;">
        <p style="margin:0;font-size:1rem;line-height:1.6;color:#162231;">
          Hello <strong>${escapeHtml(fullName)}</strong>, use the button below to create a new password for your account.
        </p>
      </div>
      <p style="margin:18px 0 0;font-size:0.96rem;line-height:1.6;color:#53697b;">
        This password reset link is time-sensitive. If you did not request a password reset, you can safely ignore this email.
      </p>
    `,
    actionLabel: 'Reset my password',
    actionUrl: resetUrl,
    footerNote: `
      If the button does not work, copy this link into your browser:<br />
      <a href="${resetUrl}" style="color:#ef7807;text-decoration:none;font-weight:700;">${resetUrl}</a>
    `,
  })

  return sendMailWithNotification({
    to: user.email,
    subject: 'Reset your password',
    text,
    html,
    attachments: getBrandLogoAttachment(),
    notification: {
      type: 'password-reset',
      subject: 'Reset your password',
      title: 'Reset your password',
      message: notificationMessage,
      body: null,
      action_label: 'Reset my password',
      action_url: resetUrl,
    },
  })
}

async function sendSubElementApprovalRequest(
  approverEmail,
  pilotName,
  projectContext,
  costingId,
  subElementTitle,
  approvalToken,
) {
  if (!approverEmail || !approverEmail.trim()) {
    throw new Error('Approver email is required to send approval request.')
  }

  const normalizedProjectContext = normalizeProjectContext(projectContext)
  const safePilotName = getDisplayValue(pilotName, 'Not assigned')
  const safeProjectDisplayName = normalizedProjectContext.project_display_name
  const safeCostingId = getDisplayValue(costingId)
  const safeSubElementTitle = getDisplayValue(subElementTitle, 'Sub-element')
  const approvalPageUrl = `${normalizeBaseUrl(process.env.FRONTEND_URL || process.env.BACKEND_URL)}/approve-sub-element/${encodeURIComponent(approvalToken)}`
  const intro = `A pilot has completed the sub-element "${safeSubElementTitle}" and is requesting your approval.`
  const notificationMessage = buildNotificationSummary([
    safeProjectDisplayName,
    safeSubElementTitle,
  ])
  const text = [
    `A sub-element needs your approval: "${safeSubElementTitle}"`,
    '',
    `Project: ${safeProjectDisplayName}`,
    `Costing ID: ${safeCostingId}`,
    `Pilot: ${safePilotName}`,
    '',
    'Please select one of the following approval statuses:',
    '- Approved',
    '- Not approved',
    '- To be approved',
    '- Ready for app',
    '- Need to be reworked',
    '',
    'This approval link expires in 7 days.',
    approvalPageUrl,
  ].join('\n')

  const html = renderEmailShell({
    eyebrow: 'Approval request',
    title: 'Approval needed for RFQ Costing sub-element',
    intro: `A pilot has completed the sub-element "${escapeHtml(safeSubElementTitle)}" and is requesting your approval.`,
    contentHtml: `
      <div style="border-radius:20px;background:#fbf8f4;border:1px solid rgba(14,78,120,0.14);padding:18px 18px 6px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${renderDetailRow('Project', safeProjectDisplayName)}
          ${renderDetailRow('Costing ID', safeCostingId)}
          ${renderDetailRow('Sub-element', safeSubElementTitle)}
          ${renderDetailRow('Pilot', safePilotName)}
        </table>
      </div>
      <p style="margin:18px 0 0;font-size:0.96rem;line-height:1.6;color:#53697b;">
        Please review and select one of the following approval statuses:
      </p>
      <div style="margin:12px 0;padding:12px;background:#f0f4f8;border-left:4px solid #ef7807;border-radius:4px;">
        <ul style="margin:0;padding-left:20px;font-size:0.96rem;color:#53697b;">
          <li>Approved</li>
          <li>Not approved</li>
          <li>To be approved</li>
          <li>Ready for app</li>
          <li>Need to be reworked</li>
        </ul>
      </div>
      <p style="margin:12px 0 0;font-size:0.95rem;line-height:1.6;color:#53697b;">
        <strong>This approval link expires in 7 days.</strong>
      </p>
    `,
    actionLabel: 'Review & Approve',
    actionUrl: approvalPageUrl,
    footerNote: `
      If the button does not work, copy this link into your browser:<br />
      <a href="${approvalPageUrl}" style="color:#ef7807;text-decoration:none;font-weight:700;">${approvalPageUrl}</a>
    `,
  })

  return sendMailWithNotification({
    to: approverEmail,
    subject: 'PL Assembly pending approval',
    text,
    html,
    attachments: getBrandLogoAttachment(),
    notification: {
      type: 'sub-element-approval-request',
      subject: 'PL Assembly pending approval',
      title: 'Approval needed for RFQ Costing sub-element',
      message: notificationMessage || intro,
      body: null,
      action_label: 'Review & Approve',
      action_url: approvalPageUrl,
      metadata: {
        rfq_id: normalizedProjectContext.rfq_id,
        project_display_name: safeProjectDisplayName,
        costing_id: safeCostingId,
        sub_element_title: safeSubElementTitle,
        pilot: safePilotName,
      },
    },
  })
}

async function sendSubElementOpeningNotification(
  managerEmail,
  pilotName,
  projectContext,
  costingId,
  subElementTitle,
) {
  const normalizedProjectContext = normalizeProjectContext(projectContext)
  const safePilotName = getDisplayValue(pilotName, 'Not assigned')
  const safeProjectDisplayName = normalizedProjectContext.project_display_name
  const safeCostingId = getDisplayValue(costingId)
  const safeSubElementTitle = getDisplayValue(subElementTitle, 'A new costing step')
  const costingPageUrl = getWorkspaceCostingUrl()
  const intro =
    'The following step has been triggered after manager approval and is now ready to be completed in PL Assembly.'
  const notificationMessage = buildNotificationSummary([
    safeProjectDisplayName,
    safeSubElementTitle,
  ])
  const text = [
    `The following step has been triggered after manager approval: "${safeSubElementTitle}"`,
    '',
    `Project: ${safeProjectDisplayName}`,
    `Costing ID: ${safeCostingId}`,
    `Pilot: ${safePilotName}`,
    '',
    'Please open PL Assembly and complete this step.',
  ].join('\n')

  const html = renderEmailShell({
    eyebrow: 'Step triggered',
    title: 'A costing step has been triggered',
    intro,
    contentHtml: `
      <div style="border-radius:20px;background:#fbf8f4;border:1px solid rgba(14,78,120,0.14);padding:18px 18px 6px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${renderDetailRow('Triggered step', safeSubElementTitle)}
          ${renderDetailRow('Project', safeProjectDisplayName)}
          ${renderDetailRow('Costing ID', safeCostingId)}
          ${renderDetailRow('Pilot', safePilotName)}
        </table>
      </div>
      <p style="margin:18px 0 0;font-size:0.96rem;line-height:1.6;color:#53697b;">
        Please open the application and complete this step.
      </p>
    `,
  })

  return sendMailWithNotification({
    to: managerEmail,
    subject: 'PL Assembly step triggered after manager approval',
    text,
    html,
    attachments: getBrandLogoAttachment(),
    notification: {
      type: 'sub-element-opened',
      subject: 'PL Assembly step triggered after manager approval',
      title: 'A costing step has been triggered',
      message: notificationMessage || intro,
      body: null,
      action_label: 'Open workspace',
      action_url: costingPageUrl,
      metadata: {
        rfq_id: normalizedProjectContext.rfq_id,
        project_display_name: safeProjectDisplayName,
        costing_id: safeCostingId,
        sub_element_title: safeSubElementTitle,
        pilot: safePilotName,
      },
    },
  })
}

async function sendPilotAssignmentNotification(
  pilotEmail,
  pilotName,
  subElementTitle,
  projectContext,
  costingId,
) {
  const normalizedProjectContext = normalizeProjectContext(projectContext)
  const safePilotName = getDisplayValue(pilotName, 'Pilot')
  const safeSubElementTitle = getDisplayValue(subElementTitle, 'a step')
  const safeProjectDisplayName = normalizedProjectContext.project_display_name
  const safeCostingId = getDisplayValue(costingId)
  const costingPageUrl = getWorkspaceCostingUrl()
  const intro = `Hello ${safePilotName}, you have been assigned to the following step in PL Assembly.`
  const notificationMessage = buildNotificationSummary([
    safeProjectDisplayName,
    safeSubElementTitle,
  ])
  const text = [
    `Hello ${safePilotName},`,
    '',
    `You have been assigned to the following step: "${safeSubElementTitle}"`,
    '',
    `Project: ${safeProjectDisplayName}`,
    `Costing ID: ${safeCostingId}`,
    '',
    'Please open PL Assembly and complete this step.',
  ].join('\n')

  const html = renderEmailShell({
    eyebrow: 'New assignment',
    title: 'You have been assigned to a step',
    intro,
    contentHtml: `
      <div style="border-radius:20px;background:#fbf8f4;border:1px solid rgba(14,78,120,0.14);padding:18px 18px 6px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${renderDetailRow('Assigned step', safeSubElementTitle)}
          ${renderDetailRow('Project', safeProjectDisplayName)}
          ${renderDetailRow('Costing ID', safeCostingId)}
        </table>
      </div>
      <p style="margin:18px 0 0;font-size:0.96rem;line-height:1.6;color:#53697b;">
        Please open the application and complete this step.
      </p>
    `,
  })

  return sendMailWithNotification({
    to: pilotEmail,
    subject: 'PL Assembly - You have been assigned to a step',
    text,
    html,
    attachments: getBrandLogoAttachment(),
    notification: {
      type: 'pilot-assignment',
      subject: 'PL Assembly - You have been assigned to a step',
      title: 'You have been assigned to a step',
      message: notificationMessage || intro,
      body: null,
      action_label: 'Open workspace',
      action_url: costingPageUrl,
      metadata: {
        rfq_id: normalizedProjectContext.rfq_id,
        project_display_name: safeProjectDisplayName,
        costing_id: safeCostingId,
        sub_element_title: safeSubElementTitle,
      },
    },
  })
}

async function sendSubElementStatusNotification(
  managerEmail,
  pilotName,
  projectContext,
  costingId,
  subElementTitle,
  status,
) {
  const normalizedProjectContext = normalizeProjectContext(projectContext)
  const safePilotName = getDisplayValue(pilotName, 'Not assigned')
  const safeProjectDisplayName = normalizedProjectContext.project_display_name
  const safeCostingId = getDisplayValue(costingId)
  const safeSubElementTitle = getDisplayValue(subElementTitle, 'A costing step')
  const costingPageUrl = getWorkspaceCostingUrl()
  const notificationMessage = buildNotificationSummary([
    safeProjectDisplayName,
    safeSubElementTitle,
    status,
  ])

  let eyebrow = 'Status update'
  let title = 'Step status updated'
  let intro = ''
  let statusColor = '#ef7807'

  switch (status) {
    case 'Help!!!':
      eyebrow = 'Help needed'
      title = 'Help needed for a step'
      intro = `The pilot needs help with the following step. Please review and provide assistance.`
      statusColor = '#dc2626'
      break
    case 'Late!':
      eyebrow = 'Late step'
      title = 'Step is late'
      intro = `The following step has exceeded its due date and is now marked as late. Please take appropriate action.`
      statusColor = '#dc2626'
      break
    case 'Escalation level 1':
      eyebrow = 'Escalation required'
      title = 'Step requires escalation'
      intro = `The following step has been escalated and requires attention. Please review and take action.`
      statusColor = '#dc2626'
      break
    default:
      eyebrow = 'Status update'
      title = 'Step status updated'
      intro = `The following step status has been updated. Please review.`
  }

  const html = renderEmailShell({
    eyebrow,
    title,
    intro,
    contentHtml: `
      <div style="border-radius:20px;background:#fbf8f4;border:1px solid rgba(14,78,120,0.14);padding:18px 18px 6px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${renderDetailRow('Step', safeSubElementTitle)}
          ${renderDetailRow('Project', safeProjectDisplayName)}
          ${renderDetailRow('Costing ID', safeCostingId)}
          ${renderDetailRow('Pilot', safePilotName)}
          ${renderDetailRow('Status', `<span style="color:${statusColor};font-weight:700;">${escapeHtml(status)}</span>`)}
        </table>
      </div>
      <p style="margin:18px 0 0;font-size:0.96rem;line-height:1.6;color:#53697b;">
        Please open the application and take appropriate action.
      </p>
    `,
  })

  const text = [
    `${eyebrow}: ${title}`,
    '',
    intro,
    '',
    `Step: "${safeSubElementTitle}"`,
    `Project: ${safeProjectDisplayName}`,
    `Costing ID: ${safeCostingId}`,
    `Pilot: ${safePilotName}`,
    `Status: ${status}`,
    '',
    'Please open PL Assembly and take appropriate action.',
  ].join('\n')

  return sendMailWithNotification({
    to: managerEmail,
    subject: `PL Assembly - ${title}`,
    text,
    html,
    attachments: getBrandLogoAttachment(),
    notification: {
      type: 'sub-element-status',
      subject: `PL Assembly - ${title}`,
      title,
      message: notificationMessage || intro,
      body: null,
      action_label: 'Open workspace',
      action_url: costingPageUrl,
      metadata: {
        rfq_id: normalizedProjectContext.rfq_id,
        project_display_name: safeProjectDisplayName,
        costing_id: safeCostingId,
        sub_element_title: safeSubElementTitle,
        pilot: safePilotName,
        status,
      },
    },
  })
}

module.exports = {
  getPasswordResetUrl,
  resolveAdminRecipients,
  sendAdminApprovalRequest,
  sendUserPasswordResetEmail,
  sendUserApprovalConfirmation,
  sendSubElementApprovalRequest,
  sendSubElementOpeningNotification,
  sendPilotAssignmentNotification,
  sendSubElementStatusNotification,
}
