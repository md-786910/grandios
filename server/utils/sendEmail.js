const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // Verify SMTP connection
  try {
    await transporter.verify();
    console.log("SMTP Server is ready to send emails");
  } catch (error) {
    console.error("SMTP Connection Failed:", error);
    throw new Error("SMTP connection failed");
  }

  // Define email options
  const mailOptions = {
    from: `"GRANDIOS Admin" <${process.env.SMTP_USER}>`,
    to: options.email,
    subject: options.subject,
    html: options.html,
  };

  // Send email
  const info = await transporter.sendMail(mailOptions);

  console.log("Email sent: %s", info.messageId);
  return info;
};

module.exports = sendEmail;
