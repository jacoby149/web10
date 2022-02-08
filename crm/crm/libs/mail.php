<?php

require '../vendor/autoload.php';

use PHPMailer\PHPMailer\SMTP;

require '../vendor/phpmailer/phpmailer/src/PHPMailer.php';
require '../vendor/phpmailer/phpmailer/src/SMTP.php';



function mail_to($email, $subject, $body) {
    $mail = new PHPMailer\PHPMailer\PHPMailer();

    $mail->IsSMTP();                                      // Set mailer to use SMTP
    $mail->Host = 'smtp.aol.com';                         // Specify main and backup SMTP servers
    $mail->Port = 587;                                    // 587 for authenticated TLS
    $mail->SMTPAuth = true;                               // Enable SMTP authentication
//     $mail->SMTPDebug = SMTP::DEBUG_SERVER;                // Activate when debuggery is necessary
    $mail->Username = 'uncommoncore@aol.com';             // SMTP username
    $mail->Password = 'hiooibgvneskgsmf';                 // SMTP password
    $mail->SMTPSecure = 'tls';                            // Enable encryption, 'ssl' also accepted

    $mail->From = 'uncommoncore@aol.com';
    $mail->FromName = 'UncommonCore Team';
    $mail->addAddress($email, $name);     // Add a recipient
    // $mail->addReplyTo('info@example.com', 'Information');
    // $mail->addCC('cc@example.com');
    $mail->addBCC('hoffman@uncommoncore.io');
    $mail->addBCC('ghoozie@uncommoncore.io');

    $mail->WordWrap = 50;                                 // Set word wrap to 50 characters
    // $mail->addAttachment('/var/tmp/file.tar.gz');         // Add attachments
    // $mail->addAttachment('/tmp/image.jpg', 'new.jpg');    // Optional name
    $mail->isHTML(true);                                  // Set email format to HTML

    $mail->Subject = $subject;
    $mail->Body    = $body;
//     $mail->AltBody = $body;

    if(!$mail->send()) {
        console_log('Message could not be sent.');
        console_log('Mailer Error: ' . $mail->ErrorInfo);
    } else {
        console_log('Message has been sent');
    }
}




?>