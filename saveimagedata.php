<?php

$photoid          = $_REQUEST['photoid'];
$flickr_username  = $_REQUEST['username'];
$flickr_realname  = $_REQUEST['realname'];
$flickr_photopage = urldecode($_REQUEST['photopageurl']);
$flickr_nsid      = $_REQUEST['nsid'];
$image_data       = base64_decode($_REQUEST['data']);
$output_base = date("Y-m-d_H-i-s");

$image_filename = $output_base . '.png';
$data_filename = '_info.json';

$file_info = array(
  "username"  => $flickr_username,
  "realname"  => $flickr_realname,
  "photopage" => $flickr_photopage,
  "nsid"      => $flickr_nsid
);
$file_info = json_encode($file_info, JSON_PRETTY_PRINT);

if(file_exists("./screenshots/" . $photoid) === FALSE) {
  mkdir("./screenshots/" . $photoid, 0777, TRUE);
}

file_put_contents("./screenshots/" . $photoid . '/' . $image_filename, $image_data);

$file_info_path = "./screenshots/" . $photoid . '/' . $data_filename;

if(file_exists($file_info_path) === FALSE) {
  file_put_contents($file_info_path, $file_info);
}

// Set the headers to JSON and so they wont cache or expire
header('Cache-Control: no-cache, must-revalidate');
header('Expires: Mon, 26 Jul 1997 05:00:00 GMT');
header('Content-type: application/json');

$return = array(
  'code' => 0
);

echo json_encode($return);