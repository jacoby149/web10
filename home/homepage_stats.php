<?php 
/*Load stats for the homepage, set stats_error to true if failed*/
$stats_error = False;

$result_teachers = $mysqli->query("SELECT COUNT(*)  AS count FROM teachers");
$num_teachers = 0;
if(!$result_teachers){
  $stats_error = True;
} else {
  $num_teachers = ($result_teachers->fetch_assoc())["count"];
}


$result_students = $mysqli->query("SELECT COUNT(*)  AS count FROM students");
$num_students = 0;
if(!$result_students){
  $stats_error = True;
} else {
  $num_students = ($result_students->fetch_assoc())["count"];
}

$result_packets_graded = $mysqli->query("SELECT COUNT(*)  AS count FROM `packet grade`");
$num_packets_graded = 0;
if(!$result_packets_graded){
  $stats_error = True;
} else {
  $num_packets_graded = ($result_packets_graded->fetch_assoc())["count"];
}

/*To calculate the number of levels progressed, we count the number of unique (student id, level) combinations in the `packet grade` table, 
and then subtract the number of unique student ids in the table to prevent overcounting 
Note: this may undercount levels progressed in the case where a student has finished all packets in a level but hasn't started packets in the next level.
We can fix this by submitting a dummy packet of the new level when students complete the previous one*/

$result_unique_pairs = $mysqli->query("SELECT COUNT(*)  AS count FROM (SELECT DISTINCT `student id`, level FROM `packet grade`) AS T");
$result_students_graded = $mysqli->query("SELECT COUNT(*)  AS count FROM (SELECT DISTINCT `student id` FROM `packet grade`) AS T");

$num_levels_progressed = 0; 
if(!$result_unique_pairs || !$result_students_graded){
  $stats_error = True;
} else {
  $num_levels_progressed = ($result_unique_pairs->fetch_assoc())["count"] - ($result_students_graded->fetch_assoc())["count"];
}

?>