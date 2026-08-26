
import dotenv from "dotenv";
import sgMail from "@sendgrid/mail";
dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const sendApprovalMail = async (to, returnId, customerName = '') => {
  const msg = {
    to,
    from: process.env.SENDGRID_FROM,
    subject: `Return ${returnId} Approved`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">Return Request Approved</h2>
        ${customerName ? `<p>Dear ${customerName},</p>` : '<p>Dear Customer,</p>'}
        <p>Your return request <strong>${returnId}</strong> has been <span style="color: #28a745; font-weight: bold;">approved</span>.</p>
        <p>We will process your return shortly. You will receive further instructions via email.</p>
        <p>Thank you for your patience.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">Risk Return Management System</p>
      </div>
    `,
  };
  try {
    const result = await sgMail.send(msg);
    console.log(`✅ Approval email sent to ${to} for return ${returnId}`);
    return result;
  } catch (error) {
    console.error(`❌ Error sending approval email:`, error);
    throw error;
  }
};

export const sendRejectionMail = async (to, returnId, customerName = '') => {
  const msg = {
    to,
    from: process.env.SENDGRID_FROM,
    subject: `Return ${returnId} Rejected`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">Return Request Rejected</h2>
        ${customerName ? `<p>Dear ${customerName},</p>` : '<p>Dear Customer,</p>'}
        <p>We regret to inform you that your return request <strong>${returnId}</strong> has been <span style="color: #dc3545; font-weight: bold;">rejected</span>.</p>
        <p>After careful review, we are unable to process this return request. This decision may be based on our return policy guidelines.</p>
        <p>If you have any questions or believe this decision was made in error, please contact our customer service team.</p>
        <p>Thank you for your understanding.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">Risk Return Management System</p>
      </div>
    `,
  };
  try {
    const result = await sgMail.send(msg);
    console.log(`✅ Rejection email sent to ${to} for return ${returnId}`);
    return result;
  } catch (error) {
    console.error(`❌ Error sending rejection email:`, error);
    throw error;
  }
};

export const sendRiskWarningMail = async (to, customerName, riskScore, riskLevel) => {
  const msg = {
    to,
    from: process.env.SENDGRID_FROM,
    subject: `Warning: Your account risk is ${riskLevel}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">Risk Warning Notification</h2>
        ${customerName ? `<p>Dear ${customerName},</p>` : '<p>Dear Customer,</p>'}
        <p>Our system has detected that your account has reached a <strong>${riskLevel}</strong> risk level with a score of <strong>${riskScore}</strong>.</p>
        <p>Please review your recent returns and avoid patterns that may be interpreted as suspicious. Continued activity at this level may affect your account privileges or return approvals.</p>
        <p>If you have any questions about this notification, please contact our support team.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">Risk Return Management System</p>
      </div>
    `,
  };

  try {
    const result = await sgMail.send(msg);
    console.log(`✅ Risk warning email sent to ${to} for ${riskLevel} risk`);
    return result;
  } catch (error) {
    console.error(`❌ Error sending risk warning email:`, error);
    throw error;
  }
};
