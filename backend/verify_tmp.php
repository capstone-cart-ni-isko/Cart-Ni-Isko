$e = DB::table('employee')->select('emp_id','emp_email','emp_categ','emp_suspended')->get();
echo json_encode(['count'=>count($e),'rows'=>$e->take(5)]);
