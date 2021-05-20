class2 = None
i = None


from geometry_msgs.msg import Twist
import rospy
import time
rospy.init_node('get_center', anonymous=True)
velocity_publisher = rospy.Publisher('/cmd_vel', Twist, queue_size=1)
vel_msg = Twist()
import roslib
import rospy
from kidbright_tpu.msg import tpu_object
from kidbright_tpu.msg import tpu_objects
import rosnode
import subprocess
import time
import os
ros_nodes = rosnode.get_node_names()
if not '/image_class' in ros_nodes:
	command='rosrun kidbright_tpu tpu_classify.py /home/pi/kbclientNew/nectec-client/dist/Project_Name'
	process = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE)
	time.sleep(10)
while not rospy.is_shutdown():
  class2 = rospy.wait_for_message('/tpu_objects', tpu_objects, timeout=4).tpu_objects
  for i in class2:
    print('This image is ')
    print(i.label)
    time.sleep(2)
